/**
 * CutterDuper — Controlador de YouTube Player
 * ==============================================
 * Reproduce solo segmentos aprobados, salta gaps, mantiene timeline editada.
 *
 * NOTA IMPORTANTE sobre latencia:
 * YouTube IFrame API seekTo() NO es instantáneo. Existe una latencia
 * de ~100-500ms entre el seekTo() y cuando el video realmente llega
 * al punto solicitado. Esto es una limitación de la API, no un bug.
 */
var CD = window.CD || {};

CD.Player = (function() {

  var ytPlayer = null;
  var pollingTimer = null;
  var isTransitioning = false;

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
          controls: 1,         // Mostrar controles nativos de YouTube
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1
        },
        events: {
          onReady: function() {
            resolve(ytPlayer);
          },
          onStateChange: onPlayerStateChange,
          onError: function(event) {
            var errorMessages = {
              2: 'ID de video invalido',
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
   * Este evento SÍ se dispara siempre — tanto si el usuario usa controles nativos
   * como si usamos playVideo()/pauseVideo() programáticamente.
   */
  function onPlayerStateChange(event) {
    switch (event.data) {
      case YT.PlayerState.PLAYING:
        CD.State.set({ isPlaying: true });
        startPolling();
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
    }
  }

  // ============================================================
  // POLLING
  // ============================================================
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
   * Funciona en dos modos:
   * - CON segmentos: mantiene timeline editada, salta gaps, detecta fin de segmento
   * - SIN segmentos: simplemente actualiza la posición actual
   */
  function pollPosition() {
    if (!ytPlayer || isTransitioning) return;
    if (typeof ytPlayer.getCurrentTime !== 'function') return;

    var currentSourceMs = Math.round(ytPlayer.getCurrentTime() * 1000);
    var segments = CD.State.get('segments');

    // --- Modo sin segmentos: solo trackear posición ---
    if (!segments || segments.length === 0) {
      CD.State.set({
        currentSourceMs: currentSourceMs,
        currentEditedMs: currentSourceMs
      });
      return;
    }

    // --- Modo con segmentos ---
    var currentSegIdx = CD.State.get('currentSegmentIndex');

    if (currentSegIdx >= 0 && currentSegIdx < segments.length) {
      var currentSeg = segments[currentSegIdx];
      var segEndMs = Number(currentSeg.source_end_ms);
      var segStartMs = Number(currentSeg.source_start_ms);

      // Llegamos al final del segmento?
      if (currentSourceMs >= segEndMs - CD.Config.SEGMENT_END_TOLERANCE_MS) {
        handleSegmentEnd(currentSegIdx);
        return;
      }

      // Estamos dentro del segmento? Actualizar posición editada
      if (currentSourceMs >= segStartMs && currentSourceMs < segEndMs) {
        var offset = currentSourceMs - segStartMs;
        var editedMs = Number(currentSeg.edited_start_ms) + offset;
        CD.State.set({
          currentSourceMs: currentSourceMs,
          currentEditedMs: editedMs
        });
        return;
      }
    }

    // El source time no coincide con ningún segmento actual.
    // Buscar en qué segmento estamos realmente.
    var editedMs = CD.Utils.sourceToEdited(currentSourceMs, segments);
    if (editedMs !== null) {
      var found = CD.Utils.findSegmentAtEditedTime(editedMs, segments);
      if (found) {
        CD.State.set({
          currentSourceMs: currentSourceMs,
          currentEditedMs: editedMs,
          currentSegmentIndex: found.index
        });
        return;
      }
    }

    // Estamos en una zona NO incluida en el montaje. Actualizar posición sin editedMs.
    CD.State.set({ currentSourceMs: currentSourceMs });
  }

  /**
   * Maneja el fin de un segmento.
   */
  function handleSegmentEnd(segmentIndex) {
    var segments = CD.State.get('segments');
    var nextIndex = segmentIndex + 1;

    if (nextIndex >= segments.length) {
      // Fin del montaje
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

    jumpToSegment(nextIndex);
  }

  /**
   * Salta a un segmento específico.
   */
  function jumpToSegment(segmentIndex) {
    var segments = CD.State.get('segments');
    if (segmentIndex < 0 || segmentIndex >= segments.length) return;

    var segment = segments[segmentIndex];
    var sourceStartMs = Number(segment.source_start_ms);
    var wasPlaying = CD.State.get('isPlaying');

    isTransitioning = true;

    seekToSource(sourceStartMs);

    CD.State.set({
      currentSegmentIndex: segmentIndex,
      currentSourceMs: sourceStartMs,
      currentEditedMs: Number(segment.edited_start_ms)
    });

    setTimeout(function() {
      isTransitioning = false;
      if (wasPlaying && ytPlayer && typeof ytPlayer.playVideo === 'function') {
        ytPlayer.playVideo();
      }
    }, 250);
  }

  // ============================================================
  // CONTROLES PUBLICOS
  // ============================================================

  function play() {
    if (!ytPlayer || typeof ytPlayer.playVideo !== 'function') return;

    var segments = CD.State.get('segments');

    // Sin segmentos: simplemente reproducir el video
    if (!segments || segments.length === 0) {
      ytPlayer.playVideo();
      return;
    }

    // Con segmentos: posicionar en el primero si no estamos en ninguno
    if (CD.State.get('currentSegmentIndex') < 0) {
      jumpToSegment(0);
      setTimeout(function() {
        if (ytPlayer) ytPlayer.playVideo();
      }, 300);
      return;
    }

    // Al final del montaje? Reiniciar
    var totalDuration = CD.Utils.getTotalEditedDuration(segments);
    if (CD.State.get('currentEditedMs') >= totalDuration) {
      jumpToSegment(0);
      setTimeout(function() {
        if (ytPlayer) ytPlayer.playVideo();
      }, 300);
      return;
    }

    ytPlayer.playVideo();
  }

  function pause() {
    if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
      ytPlayer.pauseVideo();
    }
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
   */
  function seekToEditedTime(editedMs) {
    var segments = CD.State.get('segments');
    if (!segments || segments.length === 0) {
      // Sin segmentos, seek directo
      seekToSource(editedMs);
      CD.State.set({ currentEditedMs: editedMs, currentSourceMs: editedMs });
      return;
    }

    var totalDuration = CD.Utils.getTotalEditedDuration(segments);
    editedMs = Math.max(0, Math.min(editedMs, totalDuration));

    var result = CD.Utils.editedToSource(editedMs, segments);
    if (!result) return;

    CD.State.set({
      currentSegmentIndex: result.segment_index,
      currentEditedMs: editedMs,
      currentSourceMs: result.source_time_ms
    });

    seekToSource(result.source_time_ms);
  }

  /**
   * Seek interno al video fuente de YouTube.
   */
  function seekToSource(sourceMs) {
    if (!ytPlayer || typeof ytPlayer.seekTo !== 'function') return;
    ytPlayer.seekTo(sourceMs / 1000, true);
  }

  function getVideoDuration() {
    if (!ytPlayer || typeof ytPlayer.getDuration !== 'function') return 0;
    return Math.round(ytPlayer.getDuration() * 1000);
  }

  function destroy() {
    stopPolling();
    if (ytPlayer && typeof ytPlayer.destroy === 'function') {
      ytPlayer.destroy();
    }
    ytPlayer = null;
  }

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
