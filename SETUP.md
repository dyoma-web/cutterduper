# CutterDuper — Guía de Configuración

## Requisitos previos
- Una cuenta de Google (Gmail normal funciona)
- Un navegador moderno (Chrome, Firefox, Edge)
- WAMP corriendo (para desarrollo local) o acceso a Moodle

---

## Paso 1: Crear el Google Sheet

1. Ve a [Google Sheets](https://sheets.google.com) y crea una hoja nueva.
2. Renómbrala a **"CutterDuper DB"** (o el nombre que quieras).
3. **No necesitas crear hojas ni columnas manualmente** — el Apps Script las crea automáticamente la primera vez que se usan.
4. Copia el **ID del Sheet** desde la URL:
   ```
   https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit
   ```

---

## Paso 2: Crear el Google Apps Script

1. Ve a [Google Apps Script](https://script.google.com) y crea un proyecto nuevo.
2. Renómbralo a **"CutterDuper API"**.
3. Borra el contenido del archivo `Code.gs` que viene por defecto.
4. Copia todo el contenido del archivo `apps-script/Code.gs` de este proyecto y pégalo.
5. En la línea 8 del código, pega el ID de tu Google Sheet:
   ```javascript
   const SHEET_ID = 'PEGAR_AQUÍ_EL_ID_DEL_SHEET';
   ```
6. Guarda (Ctrl+S).

---

## Paso 3: Deploy del Apps Script como Web App

1. En el editor de Apps Script, haz click en **Deploy → New deployment**.
2. En tipo, selecciona **Web app**.
3. Configura:
   - **Description**: "CutterDuper API v1"
   - **Execute as**: "Me" (tu cuenta)
   - **Who has access**: "Anyone" (importante: esto permite que el frontend lo llame)
4. Click en **Deploy**.
5. Google te pedirá autorizar el acceso. Acepta todos los permisos.
   - Si dice "This app isn't verified", click en "Advanced" → "Go to CutterDuper API (unsafe)". Es seguro, es tu propio script.
6. Copia la **URL del Web App** que te da. Se ve algo así:
   ```
   https://script.google.com/macros/s/XXXXXXX/exec
   ```

---

## Paso 4: Configurar el Frontend

1. Abre el archivo `js/config.js`.
2. Pega la URL del Web App:
   ```javascript
   APPS_SCRIPT_URL: 'https://script.google.com/macros/s/XXXXXXX/exec',
   ```
3. Guarda.

---

## Paso 5: Abrir CutterDuper

### En WAMP (desarrollo local):
- Abre tu navegador y ve a: `http://localhost/cutterduper/`

### En Moodle:
- Sube todos los archivos (index.html, carpeta css/, carpeta js/) como recurso al curso.
- Abre el index.html desde Moodle.

---

## Paso 6: Crear tu primer proyecto

1. Al abrir CutterDuper verás la pantalla de creación de proyecto.
2. Ingresa:
   - **Título**: nombre de tu proyecto
   - **ID del video de YouTube**: puedes pegar el ID solo (ej: `dQw4w9WgXcQ`) o la URL completa
   - **PIN de edición**: mínimo 4 caracteres. Este PIN protege el modo editor.
3. Click en **Crear proyecto**.
4. Listo — ya puedes agregar segmentos.

---

## Uso básico

### Modo Visualizador (por defecto)
- Ve el video con los cortes simulados
- Navega la timeline editada
- Agrega comentarios
- Hace click en comentarios para saltar a ese punto

### Modo Editor (con PIN)
- Agrega, edita, elimina y reordena segmentos
- Elimina comentarios
- El modo editor expira después de 2 horas

### Atajos de teclado
- **Espacio**: Play / Pause
- **← Izquierda**: Retroceder 5 segundos
- **→ Derecha**: Avanzar 5 segundos

---

## Solución de problemas

### "APPS_SCRIPT_URL no configurada"
→ Revisa que pegaste la URL en `js/config.js`

### "Error al cargar proyecto"
→ Verifica que el Apps Script esté desplegado y la URL sea correcta. Prueba abriendo la URL directamente en el navegador con `?action=ping` al final.

### El video dice "no embebible"
→ Algunos videos de YouTube tienen restricciones de embedding. Prueba con otro video.

### Los datos no se guardan
→ Verifica que el ID del Google Sheet en el Apps Script sea correcto y que autorizaste los permisos.

---

## Estructura del proyecto

```
cutterduper/
├── index.html              ← Página principal
├── css/
│   └── styles.css          ← Estilos (tema oscuro)
├── js/
│   ├── config.js           ← Configuración (URL del API)
│   ├── utils.js            ← Utilidades de tiempo
│   ├── state.js            ← Estado global de la app
│   ├── api.js              ← Cliente API (habla con Apps Script)
│   ├── player.js           ← Controlador YouTube Player
│   ├── timeline-ui.js      ← Barra de timeline visual
│   ├── comments.js         ← Panel de comentarios
│   ├── editor.js           ← Panel de edición (segmentos)
│   └── app.js              ← Inicialización principal
├── apps-script/
│   └── Code.gs             ← Backend (copiar a Google Apps Script)
└── SETUP.md                ← Esta guía
```

## Notas técnicas

- **Latencia en saltos**: Al saltar entre segmentos hay una pequeña latencia (~100-500ms). Esto es una limitación de YouTube IFrame API, no un bug.
- **Tiempos en milisegundos**: Todo el sistema trabaja internamente en milisegundos enteros para evitar errores de precisión.
- **Dos tiempos**: Cada punto tiene un `source_time_ms` (tiempo real del video) y un `edited_time_ms` (tiempo en el montaje editado).
- **Google Sheets como DB**: Es una solución temporal y portable. Para producción se recomienda migrar a una base de datos real.
