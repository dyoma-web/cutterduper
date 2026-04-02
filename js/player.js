/**
 * CutterDuper — Controlador de YouTube Player
 * ==============================================
 * Dos modos de reproducción:
 * - 'full': reproduce el video completo sin interrupciones
 * - 'segments': reproduce solo los segmentos definidos, salta gaps
 */
var CD = window.CD || {};

CD.Player = (function() {

  var ytPlayer = null;
  var pollingTimer = null;
  var isTransitioning = false;

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
          controls: 1,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1
        },
        events: {
          onReady: function() {
            // Guardar duración del video
            setTimeout(function() {
              var dur = getVideoDuration();
              if (dur > 0) {
                CD.State.set({ videoDurationMs: dur });
              }
            }, 500);
            resolve(ytPlayer);
          },
          onStateChange: onPlayerStateChange,
          onError: function(event) {
            var msgs = {
              2: 'ID de video invalido',
              5: 'Error de contenido HTML5',
              100: 'Video no encontrado o eliminado',
              101: 'Video no permite ser embebido',
              150: 'Video no permite ser embebido'
            };
            CD.State.set({ error: msgs[event.data] || 'Error del player' });
          }
        }
      });
    });
  }

  function onPlayerStateChange(event) {
    switch (event.data) {
      case YT.PlayerState.PLAYING:
        CD.State.set({ isPlaying: true });
        startPolling();
        // Capturar duración si no la tenemos
        if (!CD.State.get('videoDurationMs')) {
          var dur = getVideoDuration();
          if (dur > 0) CD.State.set({ videoDurationMs: dur });
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

  function pollPosition() {
    if (!ytPlayer || isTransitioning) return;
    if (typeof ytPlayer.getCurrentTime !== 'function') return;

    var currentSourceMs = Math.round(ytPlayer.getCurrentTime() * 1000);
    var segments = CD.State.get('segments');
    var mode = CD.State.get('playbackMode');

    // Actualizar source time siempre
    CD.State.set({ currentSourceMs: currentSourceMs });

    // Si no hay segmentos o modo completo, solo trackear posición
    if (!segments || segments.length === 0 || mode === 'full') {
      CD.State.set({ currentEditedMs: currentSourceMs });
      return;
    }

    // --- Modo 'segments': saltar gaps ---
    var currentSegIdx = CD.State.get('currentSegmentIndex');

    if (currentSegIdx >= 0 && currentSegIdx < segments.length) {
      var seg = segments[currentSegIdx];
      var segEnd = Number(seg.source_end_ms);
      var segStart = Number(seg.source_start_ms);

      // Fin del segmento?
      if (currentSourceMs >= segEnd - CD.Config.SEGMENT_END_TOLERANCE_MS) {
        handleSegmentEnd(currentSegIdx);
        return;
      }

      // Dentro del segmento? Actualizar edited time
      if (currentSourceMs >= segStart && currentSourceMs < segEnd) {
        var offset = currentSourceMs - segStart;
        CD.State.set({
          currentEditedMs: Number(seg.edited_start_ms) + offset
        });
        return;
      }
    }

    // Buscar si estamos dentro de algún segmento
    var editedMs = CD.Utils.sourceToEdited(currentSourceMs, segments);
    if (editedMs !== null) {
      var found = CD.Utils.findSegmentAtEditedTime(editedMs, segments);
      if (found) {
        CD.State.set({
          currentEditedMs: editedMs,
          currentSegmentIndex: found.index
        });
        return;
      }
    }

    // Estamos fuera de todos los segmentos — saltar al siguiente
    var nextSeg = findNextSegmentAfter(currentSourceMs, segments);
    if (nextSeg !== null) {
      jumpToSegment(nextSeg);
    } else {
      // Pasamos todos los segmentos — fin del montaje
      pause();
      var totalDuration = CD.Utils.getTotalEditedDuration(segments);
      CD.State.set({
        isPlaying: false,
        currentEditedMs: totalDuration,
        currentSegmentIndex: segments.length - 1
      });
      stopPolling();
    }
  }

  /**
   * Encuentra el índice del siguiente segmento cuyo source_start_ms > sourceMs.
   */
  function findNextSegmentAfter(sourceMs, segments) {
    for (var i = 0; i < segments.length; i++) {
      if (Number(segments[i].source_start_ms) > sourceMs) {
        return i;
      }
    }
    return null;
  }

  function handleSegmentEnd(segmentIndex) {
    var segments = CD.State.get('segments');
    var currentSeg = segments[segmentIndex];
    var nextIndex = segmentIndex + 1;
    var transOut = String(currentSeg.transition_out || 'direct_cut');

    // If there's a transition out, play it before moving on
    if (transOut !== 'direct_cut' && CD.Overlay && !isTransitioning) {
      isTransitioning = true;
      var fadeOutMs = Number(currentSeg.fade_out_ms) || CD.Overlay.FADE_DEFAULT_MS;
      if (ytPlayer) ytPlayer.pauseVideo();
      CD.Overlay.fadeOut(transOut, fadeOutMs).then(function() {
        proceedAfterSegment(segmentIndex);
      });
      return;
    }

    proceedAfterSegment(segmentIndex);
  }

  function proceedAfterSegment(segmentIndex) {
    var segments = CD.State.get('segments');
    var nextIndex = segmentIndex + 1;

    if (nextIndex >= segments.length) {
      isTransitioning = false;
      CD.Overlay.hide();
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

  function jumpToSegment(segmentIndex) {
    var segments = CD.State.get('segments');
    if (segmentIndex < 0 || segmentIndex >= segments.length) return;

    var segment = segments[segmentIndex];
    var segType = String(segment.type || 'video');
    var wasPlaying = CD.State.get('isPlaying');

    CD.State.set({
      currentSegmentIndex: segmentIndex,
      currentEditedMs: Number(segment.edited_start_ms)
    });

    if (segType === 'video') {
      // Video segment: seek YouTube and play
      var sourceStartMs = Number(segment.source_start_ms);
      isTransitioning = true;

      seekToSource(sourceStartMs);
      CD.State.set({ currentSourceMs: sourceStartMs });

      var transIn = String(segment.transition_in || 'direct_cut');
      var fadeInMs = Number(segment.fade_in_ms) || CD.Overlay.FADE_DEFAULT_MS;

      setTimeout(function() {
        // Start playback first, then fade in the overlay
        if (wasPlaying && ytPlayer && typeof ytPlayer.playVideo === 'function') {
          ytPlayer.playVideo();
        }
        isTransitioning = false;

        if (transIn !== 'direct_cut' && CD.Overlay) {
          // Fade in: overlay starts opaque, fades to transparent revealing video
          CD.Overlay.fadeIn(transIn, fadeInMs);
        } else if (CD.Overlay) {
          CD.Overlay.hide();
        }
      }, 250);

    } else {
      // Slide segment: pause YouTube, show slide overlay
      if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
        ytPlayer.pauseVideo();
      }
      isTransitioning = true;

      if (CD.Overlay) {
        CD.Overlay.showSlide(segment).then(function() {
          var transOut = String(segment.transition_out || 'direct_cut');
          var fadeOutMs = Number(segment.fade_out_ms) || CD.Overlay.FADE_DEFAULT_MS;
          if (transOut !== 'direct_cut') {
            CD.Overlay.fadeOut(transOut, fadeOutMs).then(function() {
              isTransitioning = false;
              proceedAfterSegment(segmentIndex);
            });
          } else {
            CD.Overlay.hide();
            isTransitioning = false;
            proceedAfterSegment(segmentIndex);
          }
        });
      }

      startSlideTimer(segment);
    }
  }

  var slideProgressTimer = null;

  function startSlideTimer(segment) {
    clearInterval(slideProgressTimer);
    var startTime = Date.now();
    var editedStart = Number(segment.edited_start_ms);
    var duration = Number(segment.duration_ms) || 5000;

    slideProgressTimer = setInterval(function() {
      var elapsed = Date.now() - startTime;
      if (elapsed >= duration) {
        clearInterval(slideProgressTimer);
        return;
      }
      CD.State.set({ currentEditedMs: editedStart + elapsed });
    }, 150);
  }

  // ============================================================
  // CONTROLES PUBLICOS
  // ============================================================

  function play() {
    if (!ytPlayer || typeof ytPlayer.playVideo !== 'function') return;

    var mode = CD.State.get('playbackMode');
    var segments = CD.State.get('segments');

    if (mode === 'segments' && segments && segments.length > 0) {
      // En modo segmentos, posicionar en el primer segmento si no estamos en uno
      if (CD.State.get('currentSegmentIndex') < 0) {
        jumpToSegment(0);
        setTimeout(function() { if (ytPlayer) ytPlayer.playVideo(); }, 300);
        return;
      }

      // Al final del montaje? Reiniciar
      var totalDuration = CD.Utils.getTotalEditedDuration(segments);
      if (CD.State.get('currentEditedMs') >= totalDuration) {
        jumpToSegment(0);
        setTimeout(function() { if (ytPlayer) ytPlayer.playVideo(); }, 300);
        return;
      }
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
   * Seek directo a un source time (usado por la barra de timeline).
   * No convierte — va directo al punto del video original.
   */
  function seekToSourceDirect(sourceMs) {
    if (!ytPlayer || typeof ytPlayer.seekTo !== 'function') return;

    var segments = CD.State.get('segments');

    // Actualizar segment index si aplica
    if (segments && segments.length > 0) {
      var editedMs = CD.Utils.sourceToEdited(sourceMs, segments);
      if (editedMs !== null) {
        var found = CD.Utils.findSegmentAtEditedTime(editedMs, segments);
        if (found) {
          CD.State.set({
            currentSegmentIndex: found.index,
            currentEditedMs: editedMs
          });
        }
      }
    }

    CD.State.set({ currentSourceMs: sourceMs });
    ytPlayer.seekTo(sourceMs / 1000, true);
  }

  /**
   * Seek a un punto en la timeline editada.
   */
  function seekToEditedTime(editedMs) {
    var segments = CD.State.get('segments');
    if (!segments || segments.length === 0) {
      seekToSourceDirect(editedMs);
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
    seekToSourceDirect: seekToSourceDirect,
    jumpToSegment: jumpToSegment,
    getVideoDuration: getVideoDuration,
    destroy: destroy
  };

})();
