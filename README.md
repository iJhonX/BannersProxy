# Banners Proxy – Render Deployment

Proxy HTTP para el Gestor de Banners de Kevins.com.co.\
Actúa como intermediario entre el gestor Angular y la página oficial, inyectando el tracker.js para la extracción dinámica de banners.

## Requisitos
- Node.js 18+
- npm

## Instalación local
```bash
npm install
node proxy-server.js
```

Servidor disponible en `http://localhost:3001`

## Variables de entorno (Render)

| Variable | Descripción |
|---|---|
| `PORT` | Puerto asignado automáticamente por Render |
| `RENDER_EXTERNAL_URL` | URL pública del servicio (asignada automáticamente por Render) |

## Despliegue en Render

1. Crear una cuenta en [render.com](https://render.com)
2. **New → Web Service → Connect a GitHub repo** (subir esta carpeta como repositorio)
3. Configuración del servicio:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `node proxy-server.js`
4. Render asigna automáticamente un dominio tipo `https://banners-proxy.onrender.com`
5. Copiar esa URL y pegarla en el proyecto Angular en:
   - `src/environments/environment.ts` → `proxyUrl`
   - `src/environments/environment.prod.ts` → `proxyUrl`

## Endpoints

| Endpoint | Descripción |
|---|---|
| `GET /kevins/*` | Proxy HTML hacia kevins.com.co con tracker inyectado |
| `GET /tracker.js` | Script de seguimiento de navegación y banners |
| `POST /api/banners/save` | Mock de la API de guardado (guarda en banners-mock-db.json) |
