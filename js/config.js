/**
 * CutterDuper — Configuración
 * ============================
 * Cambiar APPS_SCRIPT_URL por la URL de tu Web App desplegada.
 */
var CD = window.CD || {};

CD.Config = {
  // URL del Google Apps Script Web App (termina en /exec)
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbx1nL4m8sh96vMGkloZP0iFfn9e0JH2QAecFQ5LHkJzToBe0mrvAiA1fGCSDM8d_hM8KA/exec', // <-- PEGAR AQUÍ TU URL

  // Frecuencia de polling del player (ms) — 150ms es buen balance entre precisión y rendimiento
  POLLING_INTERVAL_MS: 150,

  // Tolerancia para detectar fin de segmento (ms)
  SEGMENT_END_TOLERANCE_MS: 250,

  // Duración mínima de segmento permitida (ms)
  MIN_SEGMENT_DURATION_MS: 500,

  // Duración de sesión de edición (se maneja en backend, esto es solo referencia)
  SESSION_DURATION_HOURS: 2,

  // Clave de localStorage para el token de edición
  STORAGE_TOKEN_KEY: 'cutterduper_edit_token',
  STORAGE_PROJECT_KEY: 'cutterduper_project_id'
};
