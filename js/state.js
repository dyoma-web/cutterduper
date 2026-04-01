/**
 * CutterDuper — Estado global de la aplicación
 * ==============================================
 * Patrón simple de estado observable sin dependencias.
 */
var CD = window.CD || {};

CD.State = (function() {

  // Estado central
  var state = {
    project: null,          // Objeto proyecto
    segments: [],           // Segmentos con edited times calculados
    comments: [],           // Comentarios ordenados por edited_time_ms
    editToken: null,        // Token de sesión de edición (null = modo visualizador)
    isEditing: false,       // Modo edición activo
    isPlaying: false,       // Reproducción activa
    currentEditedMs: 0,     // Posición actual en timeline editado
    currentSourceMs: 0,     // Posición actual en video fuente
    currentSegmentIndex: -1,// Índice del segmento actual
    activeCommentId: null,  // ID del comentario activo (resaltado)
    isLoading: false,       // Cargando datos
    error: null             // Último error
  };

  // Listeners por clave de estado
  var listeners = {};

  /**
   * Obtiene el estado actual o una propiedad específica.
   */
  function get(key) {
    if (key) return state[key];
    return Object.assign({}, state);
  }

  /**
   * Actualiza una o más propiedades del estado y notifica listeners.
   */
  function set(updates) {
    var changedKeys = [];
    for (var key in updates) {
      if (updates.hasOwnProperty(key) && state.hasOwnProperty(key)) {
        if (state[key] !== updates[key]) {
          state[key] = updates[key];
          changedKeys.push(key);
        }
      }
    }

    // Notificar listeners
    for (var i = 0; i < changedKeys.length; i++) {
      var k = changedKeys[i];
      if (listeners[k]) {
        for (var j = 0; j < listeners[k].length; j++) {
          try {
            listeners[k][j](state[k], k);
          } catch(e) {
            console.error('State listener error:', e);
          }
        }
      }
    }

    // Notificar listeners globales
    if (changedKeys.length > 0 && listeners['*']) {
      for (var g = 0; g < listeners['*'].length; g++) {
        try {
          listeners['*'][g](state, changedKeys);
        } catch(e) {
          console.error('State global listener error:', e);
        }
      }
    }
  }

  /**
   * Suscribirse a cambios de una propiedad específica o '*' para todos.
   * Retorna función para desuscribirse.
   */
  function on(key, callback) {
    if (!listeners[key]) listeners[key] = [];
    listeners[key].push(callback);

    return function unsubscribe() {
      var idx = listeners[key].indexOf(callback);
      if (idx >= 0) listeners[key].splice(idx, 1);
    };
  }

  /**
   * Carga token de sesión guardado.
   */
  function loadSession() {
    try {
      var token = localStorage.getItem(CD.Config.STORAGE_TOKEN_KEY);
      if (token) {
        set({ editToken: token, isEditing: true });
      }
    } catch(e) { /* localStorage no disponible */ }
  }

  /**
   * Guarda token de sesión.
   */
  function saveSession(token) {
    try {
      if (token) {
        localStorage.setItem(CD.Config.STORAGE_TOKEN_KEY, token);
      } else {
        localStorage.removeItem(CD.Config.STORAGE_TOKEN_KEY);
      }
    } catch(e) { /* localStorage no disponible */ }
  }

  // API pública
  return {
    get: get,
    set: set,
    on: on,
    loadSession: loadSession,
    saveSession: saveSession
  };

})();
