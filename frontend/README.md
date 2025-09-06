# Taller RCV — Guía rápida de instalación y empaquetado

Este README resume **cómo armar el proyecto** con los ZIPs que te pasé (backend, frontend y assets), cómo **configurarlo**, y qué hacer con los **assets si no incluyes imágenes**.

---

## 1) Estructura final deseada

```
taller-rcv/
├─ Backend/
│  ├─ package.json
│  └─ src/
│     ├─ server.js
│     ├─ controllers/
│     ├─ routes/
│     └─ db/
│        └─ database.js  (+ DB .db si la usas)
└─ frontend/
   ├─ index.html, login.html, admin.html, servicios.html, contacto.html, clientes.html, cotizaciones.html, facturacion.html, bitacora.html
   ├─ js/  (env.js, theme.js, public-content.js, *.js)
   ├─ css/ (estilos.css)
   └─ img/ (logo e imágenes — si decides incluirlas)
```

> Puedes cambiar el **nombre de la carpeta raíz** sin problema.

---

## 2) Cómo integrar los ZIPs

1. Crea una carpeta final, por ejemplo **`taller-rcv`**.
2. Descomprime dentro de esa carpeta, **en este orden**:
   - `taller-rcv-backend-CODE.part1.zip` → crea `Backend/…` (solo código, sin node_modules ni DB).
   - `taller-rcv-backend-DATA.part1.zip` → fusiona con `Backend/` (DB y/o uploads si existieran).
   - `taller-rcv-frontend-CODE.part1.zip` → crea `frontend/…` (HTML/JS/CSS).
   - Todos los ZIP de assets que descargues → se fusionan con `frontend/` (normalmente a `frontend/img/`).
3. Verifica que la estructura quede como en el diagrama del punto 1.

**¿Y si no voy a usar imágenes por ahora?**  
Puedes **omitir** descargar los assets pesados. Solo ten en cuenta:
- El **logo** que usan los documentos es `frontend/img/logo.png`. Si no existe, el PDF/Word se generará **sin logo** (no se rompe).
- Las páginas **servicios** y **contacto** mostrarán tarjetas/embeds y, si falta alguna imagen, verás un recuadro vacío. No afecta el funcionamiento.

> Recomendado: al menos coloca un `frontend/img/logo.png` sencillo (puede ser un PNG pequeño).

---

## 3) Arranque local

### Backend
En `taller-rcv/Backend/`:
```bash
npm install
npx nodemon src/server.js
```
Queda escuchando en `http://127.0.0.1:3001`.

### Frontend
Abre `taller-rcv/frontend/` con **Live Server** (o similar) y visita:
- `login.html` → te lleva al **panel** (`admin.html`)
- Páginas públicas: `index.html`, `servicios.html`, `contacto.html`

> `frontend/js/env.js` usa `http://localhost:3001/api` en local y `/api` en tu dominio `serviciosmecanicosrcv.duckdns.org`.

---

## 4) Configura tus datos (aparecen en páginas y documentos)

Edita `frontend/js/public-content.js`:
```js
window.PUBLIC_CONTENT = {
  taller: {
    nombre: 'Servicios Mecánicos RCV',
    telefono: '+504 ...',
    whatsapp: 'https://wa.me/504...?',
    direccion: 'Tegucigalpa, Honduras',
    email: 'contacto@...',
    horario: 'Lun-Sab 8:00-5:30'
  },
  redes: {
    facebookPageUrl: 'https://www.facebook.com/...',
    tiktokProfile: 'https://www.tiktok.com/@...',
    whatsappCatalogo: 'https://wa.me/c/504...',
    mapsEmbed: 'https://www.google.com/maps/embed?pb=...'
  },
  servicios: [
    { titulo: 'Mecánica General', desc: '...', img: 'img/serv-mecanica.jpg' },
    // agrega/edita más
  ]
};
```
- Se muestra en **Servicios** y **Contacto**.
- Se imprime en la cabecera de **Cotizaciones (PDF/Word)** y **Facturas (PDF)**.

---

## 5) Facturación (SAR, Honduras)

En `facturacion.html`, antes de generar facturas, configura en la sección **Configuración**:
- **RTN** del taller
- **CAI**
- **Rango autorizado** (ej. `001-001-01-00000001 a 001-001-01-00001000`)
- **Fecha límite de emisión**
- **ISV %**
- **Próximo correlativo**

Estos datos se muestran en la factura y quedan guardados localmente en el navegador (puedes cambiarlos cuando quieras).

---

## 6) ¿Qué pasa si no incluyo imágenes (assets)?

- **Logo en documentos**: el header usa `img/logo.png`. Si no está, el documento se genera **sin logo** (no error).
- **Servicios**: cada tarjeta puede referenciar `img/serv-*.jpg`. Si faltan, verás recuadros sin imagen. Puedes quitar la propiedad `img` en `public-content.js` para ese servicio y quedará solo el texto.
- **Rendimiento**: sin imágenes el sitio carga más rápido y pesa menos. Puedes agregar imágenes **más tarde** copiándolas a `frontend/img/` (no necesitas tocar el backend).

**Checklist de imágenes sugeridas (opcional):**
- `frontend/img/logo.png` — 600×200 aprox., fondo transparente si se puede.
- `frontend/img/serv-mecanica.jpg` — 1200×800.
- `frontend/img/serv-diagnostico.jpg` — 1200×800.
- `frontend/img/serv-aceite.jpg` — 1200×800.
- `frontend/img/serv-tpms.jpg` — 1200×800.

> Formato recomendado: **JPG** o **WEBP** (calidad 75–85) para balancear peso/calidad.

---

## 7) Producción (duckdns)

- Frontend en `https://serviciosmecanicosrcv.duckdns.org/`.
- Reverse proxy debe mapear `https://serviciosmecanicosrcv.duckdns.org/api` → `http://127.0.0.1:3001`.
- **CORS** ya incluye tu dominio en `Backend/src/server.js`.

---

## 8) Problemas frecuentes

- **Login OK pero no redirige**: revisa consola del navegador; verifica que `env.js` esté cargando antes del JS de login, y que el backend responda `200` en `/api/auth/login`.
- **Permisos/reset dan 404**: ya están corregidas las rutas (`/usuarios/:id/permisos`, `/usuarios/:id/reset-password`). Asegúrate de haber copiado el backend **actualizado**.
- **CORS en producción**: agrega tu dominio exacto en `allowedOrigins` si usas otro host.
- **DB vacía**: se crea usuario `admin/admin123` automáticamente si no hay registros.

---

## 9) Dónde colocar este README

Colócalo en la **raíz del proyecto** (junto a las carpetas `Backend/` y `frontend/`).  
Nombre recomendado: `README-taller-rcv.md`.

---

## 10) Comandos útiles

```bash
# Backend
cd Backend
npm install
npx nodemon src/server.js

# Frontend
# Abrir con Live Server (VS Code) o:
npx live-server frontend
```

---

¿Dudas o quieres que agregue un `README.txt` corto para el equipo con solo los pasos esenciales? Pídemelo y lo genero al instante.
