/**
 * CutterDuper — Utilidades de tiempo y timeline
 * ===============================================
 * Funciones puras para conversión de tiempos y cálculos de timeline.
 */
var CD = window.CD || {};

CD.Utils = (function() {

  /**
   * Formatea milisegundos a "MM:SS" o "HH:MM:SS" si supera 1 hora.
   */
  function formatTime(ms) {
    if (ms == null || isNaN(ms) || ms < 0) return '00:00';
    var totalSeconds = Math.floor(ms / 1000);
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;

    var pad = function(n) { return n < 10 ? '0' + n : String(n); };

    if (hours > 0) {
      return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
    }
    return pad(minutes) + ':' + pad(seconds);
  }

  /**
   * Formatea milisegundos a "MM:SS.d" (con décimas).
   */
  function formatTimePrecise(ms) {
    if (ms == null || isNaN(ms) || ms < 0) return '00:00.0';
    var totalSeconds = Math.floor(ms / 1000);
    var tenths = Math.floor((ms % 1000) / 100);
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;

    var pad = function(n) { return n < 10 ? '0' + n : String(n); };
    return pad(minutes) + ':' + pad(seconds) + '.' + tenths;
  }

  /**
   * Parsea "MM:SS", "MM:SS.d", "HH:MM:SS", o segundos directos a milisegundos.
   */
  function parseTime(str) {
    if (typeof str === 'number') return Math.round(str);
    str = String(str).trim();

    // Intenta como número directo (segundos)
    if (/^\d+(\.\d+)?$/.test(str)) {
      return Math.round(parseFloat(str) * 1000);
    }

    var parts = str.split(':');
    var seconds = 0;

    if (parts.length === 3) {
      // HH:MM:SS o HH:MM:SS.d
      seconds = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      // MM:SS o MM:SS.d
      seconds = parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
    } else {
      return NaN;
    }

    return Math.round(seconds * 1000);
  }

  /**
   * Recalcula edited_start_ms y edited_end_ms para un arreglo de segmentos
   * ya ordenados por order_index.
   * Retorna un nuevo arreglo (no muta el original).
   */
  function buildEditedTimeline(segments) {
    var result = [];
    var cursor = 0;
    for (var i = 0; i < segments.length; i++) {
      var seg = Object.assign({}, segments[i]);
      var sourceStart = Number(seg.source_start_ms);
      var sourceEnd = Number(seg.source_end_ms);
      var duration = sourceEnd - sourceStart;

      seg.edited_start_ms = cursor;
      seg.edited_end_ms = cursor + duration;
      cursor += duration;
      result.push(seg);
    }
    return result;
  }

  /**
   * Duración total del montaje editado.
   */
  function getTotalEditedDuration(segments) {
    if (!segments || segments.length === 0) return 0;
    var last = segments[segments.length - 1];
    return Number(last.edited_end_ms);
  }

  /**
   * Encuentra el segmento que contiene un tiempo editado dado.
   * Retorna { segment, index } o null.
   */
  function findSegmentAtEditedTime(editedMs, segments) {
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      if (editedMs >= Number(seg.edited_start_ms) && editedMs < Number(seg.edited_end_ms)) {
        return { segment: seg, index: i };
      }
    }
    // Si editedMs === duración total, devolver el último segmento (punto final)
    if (segments.length > 0) {
      var last = segments[segments.length - 1];
      if (editedMs >= Number(last.edited_end_ms)) {
        return { segment: last, index: segments.length - 1 };
      }
    }
    return null;
  }

  /**
   * Convierte tiempo editado a tiempo fuente.
   * Retorna { source_time_ms, segment_index } o null.
   */
  function editedToSource(editedMs, segments) {
    var found = findSegmentAtEditedTime(editedMs, segments);
    if (!found) return null;

    var seg = found.segment;
    var offset = editedMs - Number(seg.edited_start_ms);
    var sourceMs = Number(seg.source_start_ms) + offset;

    // Clamp al rango del segmento
    sourceMs = Math.min(sourceMs, Number(seg.source_end_ms));
    sourceMs = Math.max(sourceMs, Number(seg.source_start_ms));

    return {
      source_time_ms: Math.round(sourceMs),
      segment_index: found.index
    };
  }

  /**
   * Convierte tiempo fuente a tiempo editado.
   * Busca en qué segmento cae el source_time_ms.
   * Retorna edited_time_ms o null si no cae en ningún segmento.
   */
  function sourceToEdited(sourceMs, segments) {
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var sStart = Number(seg.source_start_ms);
      var sEnd = Number(seg.source_end_ms);

      if (sourceMs >= sStart && sourceMs < sEnd) {
        var offset = sourceMs - sStart;
        return Number(seg.edited_start_ms) + offset;
      }
    }
    return null;
  }

  /**
   * Valida que no haya solapamientos entre segmentos (por source time).
   * Retorna arreglo de errores (vacío si todo OK).
   */
  function validateSegments(segments) {
    var errors = [];
    var sorted = segments.slice().sort(function(a, b) {
      return Number(a.source_start_ms) - Number(b.source_start_ms);
    });

    for (var i = 0; i < sorted.length; i++) {
      var seg = sorted[i];
      var start = Number(seg.source_start_ms);
      var end = Number(seg.source_end_ms);

      if (end <= start) {
        errors.push('Segmento "' + (seg.title || i) + '": end debe ser mayor que start');
      }

      if (i > 0) {
        var prevEnd = Number(sorted[i - 1].source_end_ms);
        if (start < prevEnd) {
          errors.push('Segmento "' + (seg.title || i) + '" se solapa con el anterior');
        }
      }
    }

    return errors;
  }

  /**
   * Sanitiza un string: recorta y limita longitud.
   */
  function sanitizeString(str, maxLen) {
    if (!str) return '';
    return String(str).trim().substring(0, maxLen || 500);
  }

  // API pública
  return {
    formatTime: formatTime,
    formatTimePrecise: formatTimePrecise,
    parseTime: parseTime,
    buildEditedTimeline: buildEditedTimeline,
    getTotalEditedDuration: getTotalEditedDuration,
    findSegmentAtEditedTime: findSegmentAtEditedTime,
    editedToSource: editedToSource,
    sourceToEdited: sourceToEdited,
    validateSegments: validateSegments,
    sanitizeString: sanitizeString
  };

})();
