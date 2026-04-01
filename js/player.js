/**
 * CutterDuper — Controlador de YouTube Player
 * ==============================================
 * Reproduce solo segmentos aprobados, salta gaps, mantiene timeline editada.
 *
 * NOTA IMPORTANTE sobre latencia:
 * YouTube IFrame API seekTo() NO es instantáneo. Existe una latencia
 * de ~100-500ms entre el seekTo() y cuando el video realmente llega
 * al punto solicitado. Esto es una limitación de la API, no un bug.
 * Se mitiga pero NO se puede eliminar al 100%.
 */
var CD = window.CD || {};

CD.Player = (function() {

  var ytPlayer = null;
  var pollingTimer = null;
  var isTransitioning = false;
  var pendingSeek = null;

  /**
   * Inicializa el YouTube IFrame Player.
   */
  function init(containerId, videoId) {
    return new Promise(function(resolve, reject) {
      if (!window.YT || !window.YT.Player) {
        reject(new Error('YouTube IFrame API no cargada'));
        return;
      }

      ytPlayer = new YT.Player(containerId, {
        videoId: videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          controls: 0,         // Ocultar controles nativos
          disablekb: 1,        // Deshabilitar teclado nativo
          modestbranding: 1,   // Branding mínimo
          rel: 0,              // No mostrar videos relacionados
          iv_load_policy: 3,   // No anotaciones
          fs: 0,               // No fullscreen nativo
          playsinline: 1       // Inline en mobile
        },
        events: {
          onReady: function() {
            resolve(ytPlayer);
          },
          onStateChange: onPlayerStateChange,
          onError: function(event) {
            var errorMessages = {
              2: 'ID de video inválido',
              5: 'Error de contenido HTML5',
              100: 'Video no encontrado o eliminado',
              101: 'Video no permite ser embebido',
              150: 'Video no permite ser embebido'
            };
            var msg = errorMessages[event.data] || 'Error desconocido del player (' + event.data + ')';
            CD.State.set({ error: msg });
            console.error('YouTube Player Error:', msg);
          }
        }
      });
    });
  }

  /**
   * Maneja cambios de estado del player de YouTube.
   */
  function onPlayerStateChange(event) {
    switch (event.data) {
      case YT.PlayerState.PLAYING:
        if (!isTransitioning) {
          CD.State.set({ isPlaying: true });
          startPolling();
        }
        break;
      case YT.PlayerState.PAUSED:
        if (!isTransitioning) {
          CD.State.set({ isPlaying: false });
        }
        break;
      case YT.PlayerState.ENDED:
        CD.State.set({ isPlaying: false });
        stopPolling();
        break;
      case YT.PlayerState.BUFFERING:
        // No hacer nada especial, el polling se encarga
        break;
    }
  }

  // ============================================================
  // POLLING — El corazón del sistema
  // ============================================================
  // ¿Por qué polling y no solo eventos del player?
  // Porque YouTube solo emite eventos de cambio de estado (play/pause/end),
  // NO emite eventos continuos de posición. Necesitamos saber la posición
  // actual del video constantemente para:
  // 1. Actualizar la timeline editada
  // 2. Detectar cuándo se llega al fin de un segmento
  // 3. Sincronizar comentarios
  // 4. Detectar si YouTube se desincronizó del tiempo esperado

  function startPolling() {
    stopPolling();
    pollingTimer = setInterval(pollPosition, CD.Config.POLLING_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  /**
   * Ciclo de polling principal.
   * Se ejecuta cada POLLING_INTERVAL_MS mientras el video está reproduciéndose.
   */
  function pollPosition() {
    if (!ytPlayer || isTransitioning) return;
    if (typeof ytPlayer.getCurrentTime !== 'function') return;

    var segments = CD.State.get('segments');
    if (!segments || segments.length === 0) return;

    var currentSourceMs = Math.round(ytPlayer.getCurrentTime() * 1000);
    var currentSegIdx = CD.State.get('currentSegmentIndex');

    // Verificar si seguimos dentro del segmento actual
    if (currentSegIdx >= 0 && currentSegIdx < segments.length) {
      var currentSeg = segments[currentSegIdx];
      var segEndMs = Number(currentSeg.source_end_ms);
      var segStartMs = Number(currentSeg.source_start_ms);

      // ¿Llegamos al final del segmento?
      if (currentSourceMs >= segEndMs - CD.Config.SEGMENT_END_TOLERANCE_MS) {
        handleSegmentEnd(currentSegIdx);
        return;
      }

      // ¿Estamos dentro del segmento? Actualizar posición
      if (currentSourceMs >= segStartMs && currentSourceMs < segEndMs) {
        var offset = currentSourceMs - segStartMs;
        var editedMs = Number(currentSeg.edited_start_ms) + offset;
        CD.State.set({
          currentSourceMs: currentSourceMs,
          currentEditedMs: editedMs
        });
        return;
      }

      // YouTube se desincronizó — el tiempo real no corresponde al segmento esperado
      // Esto puede pasar si YouTube hace buffering y salta.
      // Corregir: volver al inicio del segmento actual.
      console.warn('Desincronización detectada. Esperado segmento', currentSegIdx,
        '(' + segStartMs + '-' + segEndMs + '), actual:', currentSourceMs);
      seekToSource(segStartMs);
    }
  }

  /**
   * Maneja el fin de un segmento: salta al siguiente o termina la reproducción.
   */
  function handleSegmentEnd(segmentIndex) {
    var segments = CD.State.get('segments');
    var nextIndex = segmentIndex + 1;

    if (nextIndex >= segments.length) {
      // Fin de la reproducción editada
      pause();
      var totalDuration = CD.Utils.getTotalEditedDuration(segments);
      CD.State.set({
        isPlaying: false,
        currentEditedMs: totalDuration,
        currentSegmentIndex: segments.length - 1
      });
      stopPolling();
      return;
    }

    // Saltar al siguiente segmento
    jumpToSegment(nextIndex);
  }

  /**
   * Salta a un segmento específico.
   * Maneja la transición con pausa breve para minimizar glitch visual.
   */
  function jumpToSegment(segmentIndex) {
    var segments = CD.State.get('segments');
    if (segmentIndex < 0 || segmentIndex >= segments.length) return;

    var segment = segments[segmentIndex];
    var sourceStartMs = Number(segment.source_start_ms);
    var wasPlaying = CD.State.get('isPlaying');

    isTransitioning = true;

    // Pausar brevemente para evitar que se vea un frame del gap
    if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
      ytPlayer.pauseVideo();
    }

    // Seek al inicio del siguiente segmento
    seekToSource(sourceStartMs);

    CD.State.set({
      currentSegmentIndex: segmentIndex,
      currentSourceMs: sourceStartMs,
      currentEditedMs: Number(segment.edited_start_ms)
    });

    // Esperar un momento para que YouTube haga el seek, luego reanudar
    setTimeout(function() {
      isTransitioning = false;
      if (wasPlaying && ytPlayer && typeof ytPlayer.playVideo === 'function') {
        ytPlayer.playVideo();
      }
    }, 200); // 200ms de gracia para que YouTube procese el seekTo
  }

  // ============================================================
  // CONTROLES PÚBLICOS
  // ============================================================

  function play() {
    var segments = CD.State.get('segments');
    if (!segments || segments.length === 0) return;

    // Si no hay segmento actual, empezar desde el primero
    if (CD.State.get('currentSegmentIndex') < 0) {
      jumpToSegment(0);
      setTimeout(function() {
        if (ytPlayer) ytPlayer.playVideo();
        CD.State.set({ isPlaying: true });
        startPolling();
      }, 300);
      return;
    }

    // Verificar si estamos al final del montaje
    var totalDuration = CD.Utils.getTotalEditedDuration(segments);
    if (CD.State.get('currentEditedMs') >= totalDuration) {
      // Reiniciar desde el inicio
      jumpToSegment(0);
      setTimeout(function() {
        if (ytPlayer) ytPlayer.playVideo();
        CD.State.set({ isPlaying: true });
        startPolling();
      }, 300);
      return;
    }

    if (ytPlayer) ytPlayer.playVideo();
    CD.State.set({ isPlaying: true });
    startPolling();
  }

  function pause() {
    if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
      ytPlayer.pauseVideo();
    }
    CD.State.set({ isPlaying: false });
    stopPolling();
  }

  function togglePlayPause() {
    if (CD.State.get('isPlaying')) {
      pause();
    } else {
      play();
    }
  }

  /**
   * Seek a un punto en la timeline editada (en ms).
   * Esta es la función principal para navegación del usuario.
   */
  function seekToEditedTime(editedMs) {
    var segments = CD.State.get('segments');
    if (!segments || segments.length === 0) return;

    // Clamp al rango válido
    var totalDuration = CD.Utils.getTotalEditedDuration(segments);
    editedMs = Math.max(0, Math.min(editedMs, totalDuration));

    var result = CD.Utils.editedToSource(editedMs, segments);
    if (!result) return;

    var wasPlaying = CD.State.get('isPlaying');

    // Si cambió de segmento, hacer jump
    var currentSegIdx = CD.State.get('currentSegmentIndex');
    if (result.segment_index !== currentSegIdx) {
      CD.State.set({ currentSegmentIndex: result.segment_index });
    }

    seekToSource(result.source_time_ms);

    CD.State.set({
      currentEditedMs: editedMs,
      currentSourceMs: result.source_time_ms
    });

    // Si estaba reproduciéndose, continuar
    if (wasPlaying) {
      setTimeout(function() {
        if (ytPlayer) ytPlayer.playVideo();
      }, 150);
    }
  }

  /**
   * Seek interno al video fuente de YouTube.
   */
  function seekToSource(sourceMs) {
    if (!ytPlayer || typeof ytPlayer.seekTo !== 'function') return;
    ytPlayer.seekTo(sourceMs / 1000, true);
  }

  /**
   * Obtiene la duración total del video fuente de YouTube.
   */
  function getVideoDuration() {
    if (!ytPlayer || typeof ytPlayer.getDuration !== 'function') return 0;
    return Math.round(ytPlayer.getDuration() * 1000);
  }

  /**
   * Destruye el player.
   */
  function destroy() {
    stopPolling();
    if (ytPlayer && typeof ytPlayer.destroy === 'function') {
      ytPlayer.destroy();
    }
    ytPlayer = null;
  }

  // API pública
  return {
    init: init,
    play: play,
    pause: pause,
    togglePlayPause: togglePlayPause,
    seekToEditedTime: seekToEditedTime,
    jumpToSegment: jumpToSegment,
    getVideoDuration: getVideoDuration,
    destroy: destroy
  };

})();
