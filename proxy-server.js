const express = require('express');
const axios   = require('axios');
const cors    = require('cors');
const zlib    = require('zlib');
const fs      = require('fs');
const path    = require('path');

const app    = express();
const TARGET = 'https://kevins.com.co';

// Render asigna un puerto dinámico via variable de entorno.
// Localmente usamos 3001 como fallback.
const PORT     = process.env.PORT || 3001;

// URL pública del proxy. En Render, se lee de la variable de entorno.
// En local, usamos localhost. Se usa para la inyección del tracker.js.
const BASE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// Middleware manual de CORS a prueba de balas
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});
app.use(express.json({ limit: '5mb' }));

// ── Health check (ruta raíz) ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Banners Proxy – Kevins.com.co',
    endpoints: {
      kevins : `${BASE_URL}/kevins`,
      tracker: `${BASE_URL}/tracker.js`,
      save   : `POST ${BASE_URL}/api/banners/save`
    }
  });
});


app.post('/api/banners/save', (req, res) => {
    
    const payload = req.body;
    console.log("======================================================================");
    console.log("=== [MOCK DB] Recibido payload para inyectar a Cosmos DB =============");
    console.log("======================================================================");
    console.log(JSON.stringify(payload, null, 2));
    
    // Guardar en archivo local
    fs.writeFileSync(path.join(process.cwd(), 'banners-mock-db.json'), JSON.stringify(payload, null, 2));
    console.log("=== Payload simulado guardado exitosamente en banners-mock-db.json ===");
    console.log("======================================================================");
    
    res.json({ success: true, message: 'Inyectado exitosamente.' });
});

// =========================================================================
// TRACKER: Script inyectado al final del <body> de cada página de Kevins.
// Detecta la navegación del usuario dentro del iframe y envía postMessage
// al componente Angular padre (iframe-panel) con la URL actual.
// =========================================================================
app.get('/tracker.js', (req, res) => {
  res.type('application/javascript');
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(`
    (function(){
      const ORIGINAL = 'https://kevins.com.co';

      // ── Convierte URLs del proxy (cualquier origen) a la URL original de Kevins ──
      // Funciona tanto en localhost:3001 como en Render u otro host.
      function toOriginal(url) {
        if (!url) return url;
        var proxyOrigin = window.location.origin; // ej: https://bannersproxy.onrender.com
        // Caso 1: URL absoluta del proxy actual (localhost o Render)
        if (url.startsWith(proxyOrigin)) {
          var path = url.substring(proxyOrigin.length); // ej: /kevins/busqueda/...
          if (path.startsWith('/kevins')) path = path.substring('/kevins'.length) || '/';
          return ORIGINAL + (path || '/');
        }
        // Caso 2: URL relativa /kevins/...
        if (url.startsWith('/kevins/')) return ORIGINAL + url.substring('/kevins'.length);
        if (url.startsWith('/kevins')) return ORIGINAL + '/';
        // Caso 3: Ya es URL original
        if (url.startsWith(ORIGINAL)) return url;
        // Caso 4: Relativa simple
        if (url.startsWith('/')) return ORIGINAL + url;
        return url;
      }

      // ── Envía un mensaje al componente Angular padre ──
      function post(tipo, payload) {
        try {
          window.parent.postMessage(Object.assign({ tipo: tipo }, payload || {}), '*');
        } catch(e) {}
      }

      // ── DEBOUNCE: Evita enviar muchos mensajes seguidos (ej: al navegar menús) ──
      var _debounceTimer = null;
      var DEBOUNCE_MS    = 500;
      function postDebounced(tipo, payload) {
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(function() { post(tipo, payload); }, DEBOUNCE_MS);
      }

      // ── Evento popstate (botón atrás/adelante del navegador) ──
      window.addEventListener('popstate', function() {
        postDebounced('navegacion', { url: toOriginal(window.location.href) });
      });

      // ── CLICK GENERAL ──
      // Usamos fase de BURBUJA (false) en vez de captura (true)
      document.addEventListener('click', function(e) {
        try {
            var target = e.target;
            if (!target) return;
            var before = window.location.href;
            
            // Si es un nodo de texto, subimos a su padre elemento
            if (target.nodeType === 3) target = target.parentNode;
            
            var pick = target && typeof target.closest === 'function'
              ? target.closest('a, button, [href], [onclick], [role="button"], [data-href]')
              : null;

            // Buscar primero si lo clickeado fue directamente la imagen, o si hay una imagen dentro del link/botón
            var imgTarget = (target.tagName === 'IMG' || target.tagName === 'VIDEO') ? target : null;
            if (!imgTarget && pick && typeof pick.querySelector === 'function') {
                imgTarget = pick.querySelector('img, video');
            }
            if (!imgTarget && typeof target.closest === 'function') {
                var slidePadre = target.closest('[class*="slide" i], [class*="item" i], [class*="banner" i], .banner');
                if (slidePadre) imgTarget = slidePadre.querySelector('img, video');
            }

            var srcClickeado = imgTarget ? (imgTarget.currentSrc || imgTarget.src) : '';
            if (!srcClickeado && pick && pick.nodeType === 1) {
                var style = window.getComputedStyle(pick);
                if (style.backgroundImage && style.backgroundImage !== 'none') {
                    srcClickeado = style.backgroundImage.slice(4, -1).replace(/["']/g, "");
                }
            }
            if (!srcClickeado && target && target.nodeType === 1) {
                var tStyle = window.getComputedStyle(target);
                if (tStyle.backgroundImage && tStyle.backgroundImage !== 'none') {
                    srcClickeado = tStyle.backgroundImage.slice(4, -1).replace(/["']/g, "");
                }
            }
            if (srcClickeado) srcClickeado = toOriginal(srcClickeado.split(' ')[0]);

            var texto = pick ? (pick.textContent || '').trim().slice(0, 80) : '';
            var elemento = pick
              ? (pick.tagName + (pick.className ? '.' + String(pick.className).split(' ')[0] : ''))
              : 'UNKNOWN';

            // Siempre enviamos el click si detectamos un SRC, asumiendo click en banner, 
            // aunque el router tarde en procesar la URL. Esperamos 500ms para atrapar la nueva ruta.
            setTimeout(function() {
              var after = window.location.href;
              var href = pick ? (pick.href || pick.getAttribute('href') || pick.dataset.href || '') : '';
              
              var finalUrl = '';
              if (after !== before) {
                  finalUrl = after; // Prioridad 1: Navegación real completada
              } else if (href && !href.startsWith('javascript') && !href.startsWith('#')) {
                  finalUrl = href; // Prioridad 2: Atributo href presente
              } else if (srcClickeado) {
                  finalUrl = window.location.href; // Prioridad 3: Garantizar el evento! Envía la actual si no cambió.
              } else {
                  return; // Si no navegó, no hay href, y no tocaste una foto, no es de interés.
              }

              postDebounced('clickReal', {
                  url      : toOriginal(finalUrl),
                  texto    : texto,
                  titulo   : document.title,
                  posicion : { x: Math.round(e.clientX), y: Math.round(e.clientY) },
                  elemento : elemento,
                  srcClick : srcClickeado || '',
                  timestamp: Date.now()
              });
            }, 500); // 500ms da tiempo de sobra a cualquier SPA a actualizar window.location
        } catch(ex) {
            console.error('Error procesando click en tracker:', ex);
        }
      }, false);

      // URL inicial al cargar la página
      post('navegacion', { url: toOriginal(window.location.href) });
      console.log('Tracker activo (con debounce)');

      // ── EXTRAER BANNERS DE LA PÁGINA (SOLO LOBBY PRINCIPAL .webp) ──
      function extraerBanners() {
        var path = window.location.pathname;
        if (path !== '/' && path !== '/kevins/') return;
        
        var images = document.querySelectorAll('img, video');
        var banners = [];
        var vistas = {};
        window._lobbyContainer = null; // Reiniciar en cada ejecución por seguridad SPA
        
        for(var i = 0; i < images.length; i++) {
          var el = images[i];
          var src = el.currentSrc || el.src;
          var isVideo = el.tagName.toLowerCase() === 'video';
          
          if (!src && isVideo) {
             var source = el.querySelector('source');
             if (source) src = source.src;
          }
          if (!src || vistas[src]) continue;
          
          var lowerSrc = src.toLowerCase();
          
          // REGLA 1: Solo formato .webp como pediste o que sea un video
          var isFormatoValido = lowerSrc.indexOf('.webp') !== -1 || lowerSrc.indexOf('.mp4') !== -1 || lowerSrc.indexOf('.webm') !== -1 || isVideo;
          if (!isFormatoValido) continue;
          
          var rect = el.getBoundingClientRect();
          var absoluteTop = window.scrollY + rect.top;

          // REGLA 2: LÍMITE FÍSICO. Si la imagen está renderizada muy abajo en la pantalla (ej: Footer), la descartamos inmediatamente.
          if (absoluteTop > 1500) continue;

          var isInSlider = el.closest('[class*="slider" i], [class*="carousel" i], [class*="swiper" i]');
          // En caso de que el video aún no tenga dimensiones calculadas, 
          // confiamos más en si está en un slider.
          var isLargeBanner = (rect.width > 500 || el.width > 500);
          
          if (!isInSlider && !isLargeBanner) continue;
          
          // REGLA DEFINITIVA: El primer banner grande o slider que encontremos 
          // definirá el contenedor único del que sacaremos los banners.
          if (!window._lobbyContainer) {
             window._lobbyContainer = isInSlider || el.parentElement;
          }
          
          // Ignorar cualquier cosa fuera de la cabecera / lobby inicial
          if (!window._lobbyContainer.contains(el)) continue;
          
          vistas[src] = true;
          
          var srcMobile = '';
          var srcWeb = '';

          var picturePadre = el.closest('picture');
          if (picturePadre) {
             var sources = picturePadre.querySelectorAll('source');
             for (var s = 0; s < sources.length; s++) {
                 var media = sources[s].getAttribute('media') || '';
                 var srcset = sources[s].getAttribute('srcset');
                 if (!srcset) continue;
                 var parsedUrl = toOriginal(srcset.split(' ')[0]);
                 
                 // El web suele tener min-width, el mobile max-width
                 if (media.includes('max-width') || media.includes('mobile') || parsedUrl.includes('_Mobile') || parsedUrl.includes('_mobile')) {
                     if (!srcMobile) srcMobile = parsedUrl;
                 } else if (media.includes('min-width') || media.includes('desktop') || parsedUrl.includes('_WEB') || parsedUrl.includes('_web')) {
                     if (!srcWeb) srcWeb = parsedUrl;
                 }
             }
          }

          // Si identificamos explícitamente el Web y el Mobile dentro del picture
          if (srcWeb) {
             src = srcWeb; // Forzar el src principal a ser el WEB
             } else if (typeof src === 'string' && (src.includes('_Mobile') || src.includes('_mobile') || src.includes('mobile') || src.includes('Mobile'))) {
             // Si no hay picture pero la imagen suelta es la móvil (lo cual ocurre al escanear headless viewport), lo invertimos.
             srcMobile = toOriginal(src);
             // Usamos Regex para asegurar que solo reemplazamos en el nombre del archivo (después del último slash)
             // Esto evita romper dominios como kevinsweb.blob.core.windows.net
             src = toOriginal(
                 src.replace(/_Mobile([^\/]*)$/, '_WEB$1')
                    .replace(/_mobile([^\/]*)$/, '_web$1')
                    .replace(/mobile([^\/]*)$/, 'web$1')
                    .replace(/Mobile([^\/]*)$/, 'Web$1')
             );
          } else if (!srcMobile && typeof src === 'string') {
             // Fallback Heurístico para detectar el móvil si solo tenemos el WEB
             if (src.includes('_WEB')) {
                 srcMobile = toOriginal(src.replace(/_WEB([^\/]*)$/, '_Mobile$1'));
             } else if (src.includes('_web')) {
                 srcMobile = toOriginal(src.replace(/_web([^\/]*)$/, '_mobile$1'));
             } else if (src.includes('web')) {
                 srcMobile = toOriginal(src.replace(/web([^\/]*)$/, 'mobile$1'));
             } else if (src.includes('Web')) {
                 srcMobile = toOriginal(src.replace(/Web([^\/]*)$/, 'Mobile$1'));
             }
          }

          src = toOriginal(src);

          var extension = isVideo ? '.mp4' : '.webp';
          var archivo = 'Banner ' + (banners.length + 1) + extension;
          try {
            var parts = new URL(src).pathname.split('/');
            var decoded = decodeURIComponent(parts[parts.length - 1]);
            // Limpiamos queries si las hay
            decoded = decoded.split('?')[0];
            if (decoded.includes('.webp') || decoded.includes('.mp4') || decoded.includes('.webm')) {
                archivo = decoded;
            }
          } catch(e) {}
          
          var aTag = el.closest('a');
          var enlaceUrl = aTag ? (aTag.getAttribute('href') || aTag.href) : '';
          
          if (!enlaceUrl) {
              var slidePadre = el.closest('[class*="slide" i], [class*="item" i], [class*="banner" i], div');
              if (slidePadre) {
                  var aHijo = slidePadre.querySelector('a[href], a[routerlink]');
                  if (aHijo) {
                      enlaceUrl = aHijo.getAttribute('href') || aHijo.href || '';
                  }
                  if (!enlaceUrl) {
                      enlaceUrl = slidePadre.getAttribute('ng-reflect-router-link')
                              || slidePadre.getAttribute('routerlink')
                              || slidePadre.getAttribute('data-href')
                              || slidePadre.getAttribute('data-link')
                              || '';
                  }
              }
              var padreActual = el.parentElement;
              for (var p = 0; p < 5 && padreActual && !enlaceUrl; p++) {
                  enlaceUrl = padreActual.getAttribute('ng-reflect-router-link')
                           || padreActual.getAttribute('routerlink')
                           || padreActual.getAttribute('data-href') || '';
                  var aEnPadre = padreActual.querySelector(':scope > a');
                  if (!enlaceUrl && aEnPadre) {
                      enlaceUrl = aEnPadre.getAttribute('href') || aEnPadre.href || '';
                  }
                  padreActual = padreActual.parentElement;
              }
          }

          if (enlaceUrl) enlaceUrl = toOriginal(enlaceUrl);

          banners.push({
            id: 'banner-auto-' + banners.length,
            archivo: archivo,
            activo: true,
            type: isVideo ? 'VIDEO' : 'IMAGEN',
            src: toOriginal(src),
            srcMobile: srcMobile,
            tieneMobile: !!srcMobile,
            alt: archivo,
            seccion: 'home',
            ruta: enlaceUrl,
            usuario: 'tracker-auto',
            duracion: 5000,
            orden: 0 // Se asigna después
          });
        }
        
        // Reasignar el orden ahora que sabemos exactamente cuántos hay
        // El primero tendrá el # mayor (ej. 8), el último tendrá el 1.
        for (var j = 0; j < banners.length; j++) {
            banners[j].orden = banners.length - j;
        }
        
        if (banners.length > 0) {
          post('bannersExtraidos', { banners: banners });
        }
      }
      
      // 1ª pasada rápida: captura imágenes y dimensiones (Angular aún no hidrata links)
      window.addEventListener('load', function() {
        setTimeout(extraerBanners, 1500);
      });
      setTimeout(extraerBanners, 2000);

      // 2ª pasada tardía: Angular ya asignó href a los <a [routerLink]>, captura los links
      setTimeout(extraerBanners, 5500);

      // 3ª pasada de seguridad: para sitios pesados que tardan más en hidratar
      setTimeout(extraerBanners, 9000);
    })();
  `);
});

// =========================================================================
// HEAD SCRIPT: Intercepta pushState/replaceState.
// - Convierte URLs absolutas de kevins.com.co a relativas (same-origin)
// - Solo notifica al padre cuando el PATH realmente cambia (no en hovers)
// - Usa debounce de 400ms para no interferir con menús desplegables
// =========================================================================
function getHeadScript() {
  return `<script>
(function(){
  var _push    = history.pushState.bind(history);
  var _replace = history.replaceState.bind(history);

  // Convierte URL absoluta de kevins a relativa para proxy
  function convertirUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.match(/https?:\\/\\/kevins\\.com\\.co/)) {
      var path = url.replace(/https?:\\/\\/kevins\\.com\\.co/, '');
      return path || '/';
    }
    return url;
  }

  // Extrae solo el pathname de una URL (ignora query y hash)
  function getPath(url) {
    if (!url) return '';
    try { return new URL(url, window.location.origin).pathname; }
    catch(e) { return url.split('?')[0].split('#')[0]; }
  }

  // Se almacena el último path notificado para no enviar duplicados
  var _lastNotifiedPath = getPath(window.location.pathname);
  var _notifyTimer = null;

  function notificarSiCambio(url) {
    var fullUrl = (typeof url === 'string' && !url.startsWith('http'))
      ? '${TARGET}' + (url.startsWith('/') ? url : '/' + url)
      : (url || window.location.href);

    var newPath = getPath(fullUrl);
    // Si el path no cambió (ej: hover de menú) → no avisar
    if (newPath === _lastNotifiedPath) return;

    // Debounce de 400ms: si viene otro pushState rápido, se cancela el anterior
    clearTimeout(_notifyTimer);
    _notifyTimer = setTimeout(function() {
      _lastNotifiedPath = newPath;
      try { window.parent.postMessage({ tipo: 'navegacion', url: fullUrl }, '*'); } catch(e){}
    }, 400);
  }

  history.pushState = function(state, title, url) {
    var safeUrl = convertirUrl(url);
    try { _push(state, title, safeUrl); } catch(err) {
      console.log('pushState corregido:', safeUrl);
    }
    // Solo notifica si el path realmente cambió
    notificarSiCambio(url);
  };

  // replaceState: solo convierte URL, NO notifica (se usa para cambios de estado sin navegación)
  history.replaceState = function(state, title, url) {
    var safeUrl = convertirUrl(url);
    try { _replace(state, title, safeUrl); } catch(err){}
  };

  // Suprimir errores de SecurityError
  window.addEventListener('error', function(e) {
    if (e.message && (
      e.message.includes('SecurityError') ||
      e.message.includes('pushState') ||
      e.message.includes('history')
    )) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return false;
    }
  }, true);

  window.addEventListener('unhandledrejection', function(e) {
    if (e.reason && e.reason.toString().includes('SecurityError')) {
      e.preventDefault();
    }
  });

  console.log('History interceptor activo (path-change + debounce)');
})();
</script>`;
}

// Descomprimir respuesta
function descomprimir(data, encoding) {
  try {
    if (encoding === 'gzip')    return zlib.gunzipSync(data);
    if (encoding === 'deflate') return zlib.inflateSync(data);
    if (encoding === 'br')      return zlib.brotliDecompressSync(data);
  } catch(e) { console.warn('⚠️ Descomprimir:', e.message); }
  return data;
}

// Proxy principal
app.use('/kevins', async (req, res) => {
  try {
    const rutaOriginal = req.url || '/';
    const urlDestino   = TARGET + rutaOriginal;
    console.log('Proxy →', urlDestino);

    const response = await axios.get(urlDestino, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
        'Accept'         : '*/*',
        'Accept-Language': 'es-CO,es;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Referer'        : TARGET,
        'Origin'         : TARGET
      },
      maxRedirects : 10,
      timeout      : 20000,
      validateStatus: () => true
    });

    const contentType = response.headers['content-type'] || 'text/html';
    const encoding    = response.headers['content-encoding'];
    const bodyBuffer  = descomprimir(response.data, encoding);
    let   content     = bodyBuffer.toString('utf-8');

    console.log(`${response.status} | ${content.length} bytes | ${contentType}`);

    if (contentType.includes('text/html')) {

      // 🔑 CLAVE: Eliminar <base href> original de kevins
      content = content.replace(/<base[^>]*>/gi, '');

      // 🔑 CLAVE: Inyectar nuevo <base href="/kevins/"> para que
      //    el router de kevins use rutas del proxy (/kevins/ruta)
      //    y pushState sea siempre same-origin (localhost:3001)
      const baseTag    = `<base href="/kevins/">`;
      const trackerTag = `<script src="${BASE_URL}/tracker.js?t=${Date.now()}"></script>`;
      const headScript = getHeadScript();

      // Inyectar PRIMERO en <head> (antes de scripts de kevins)
      if (content.includes('<head>')) {
        content = content.replace('<head>', `<head>${baseTag}${headScript}`);
      } else if (content.includes('<HEAD>')) {
        content = content.replace('<HEAD>', `<HEAD>${baseTag}${headScript}`);
      } else {
        content = baseTag + headScript + content;
        
      }

      // Tracker al final
      content = content.includes('</body>')
        ? content.replace('</body>', `${trackerTag}</body>`)
        : content + trackerTag;
    }

    res.set({
      'Content-Type'               : contentType,
      'Access-Control-Allow-Origin': '*',
      'X-Frame-Options'            : 'ALLOWALL',
      'Content-Security-Policy'    : "frame-ancestors *; script-src * 'unsafe-inline' 'unsafe-eval';",
      'Cache-Control'              : 'no-cache'
    });

    res.status(response.status).send(content);

  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).send(`
      <html>
        <body style="font-family:sans-serif;padding:30px;">
          <h2>❌ Error Proxy</h2>
          <p><b>Ruta:</b> ${req.url}</p>
          <p><b>Error:</b> ${err.message}</p>
          <button onclick="history.back()">⬅ Volver</button>
          <button onclick="location.reload()">🔄 Reintentar</button>
        </body>
      </html>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`Proxy NAVEGACION LIVE BANNERS`);
  console.log(`kevins  : ${BASE_URL}/kevins`);
  console.log(`tracker : ${BASE_URL}/tracker.js`);
});