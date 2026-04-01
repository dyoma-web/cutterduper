/**
 * CutterDuper — Timeline UI
 * ==========================
 * Barra visual de la timeline editada.
 * Muestra segmentos como bloques, playhead, click para seek.
 */
var CD = window.CD || {};

CD.TimelineUI = (function() {

  var container = null;
  var segmentsBar = null;
  var playhead = null;
  var timeDisplay = null;
  var durationDisplay = null;
  var isDragging = false;

  // Colores para segmentos (rotan)
  var SEGMENT_COLORS = [
    '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981',
    '#f59e0b', '#ef4444', '#ec4899', '#6366f1'
  ];

  /**
   * Inicializa el timeline UI.
   */
  function init(containerId) {
    container = document.getElementById(containerId);
    if (!container) return;

    render();
    bindEvents();

    // Suscribirse a cambios de estado
    CD.State.on('segments', renderSegments);
    CD.State.on('currentEditedMs', updatePlayhead);
  }

  function render() {
    container.innerHTML = '';
    container.className = 'cd-timeline';

    // Controles de reproducción
    var controls = document.createElement('div');
    controls.className = 'cd-timeline__controls';

    var playBtn = document.createElement('button');
    playBtn.className = 'cd-btn cd-btn--play';
    playBtn.id = 'cd-play-btn';
    playBtn.innerHTML = '<span class="cd-icon-play">&#9654;</span>';
    playBtn.title = 'Play / Pause';
    playBtn.addEventListener('click', function() {
      CD.Player.togglePlayPause();
    });

    timeDisplay = document.createElement('span');
    timeDisplay.className = 'cd-timeline__time';
    timeDisplay.textContent = '00:00';

    var separator = document.createElement('span');
    separator.className = 'cd-timeline__separator';
    separator.textContent = ' / ';

    durationDisplay = document.createElement('span');
    durationDisplay.className = 'cd-timeline__duration';
    durationDisplay.textContent = '00:00';

    controls.appendChild(playBtn);
    controls.appendChild(timeDisplay);
    controls.appendChild(separator);
    controls.appendChild(durationDisplay);

    // Barra de segmentos
    var barWrapper = document.createElement('div');
    barWrapper.className = 'cd-timeline__bar-wrapper';

    segmentsBar = document.createElement('div');
    segmentsBar.className = 'cd-timeline__bar';

    playhead = document.createElement('div');
    playhead.className = 'cd-timeline__playhead';

    barWrapper.appendChild(segmentsBar);
    barWrapper.appendChild(playhead);

    container.appendChild(controls);
    container.appendChild(barWrapper);

    // Render inicial
    renderSegments();
  }

  /**
   * Renderiza los bloques de segmentos en la barra.
   */
  function renderSegments() {
    if (!segmentsBar) return;
    segmentsBar.innerHTML = '';

    var segments = CD.State.get('segments');
    var totalDuration = CD.Utils.getTotalEditedDuration(segments);

    if (totalDuration === 0 || segments.length === 0) {
      segmentsBar.innerHTML = '<div class="cd-timeline__empty">Sin segmentos definidos</div>';
      if (durationDisplay) durationDisplay.textContent = '00:00';
      return;
    }

    if (durationDisplay) durationDisplay.textContent = CD.Utils.formatTime(totalDuration);

    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var duration = Number(seg.edited_end_ms) - Number(seg.edited_start_ms);
      var widthPercent = (duration / totalDuration) * 100;

      var block = document.createElement('div');
      block.className = 'cd-timeline__segment';
      block.style.width = widthPercent + '%';
      block.style.backgroundColor = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
      block.dataset.index = i;
      block.title = (seg.title || 'Segmento ' + (i + 1)) +
        '\n' + CD.Utils.formatTime(Number(seg.source_start_ms)) +
        ' → ' + CD.Utils.formatTime(Number(seg.source_end_ms)) +
        ' (fuente)';

      // Label del segmento (solo si es suficientemente ancho)
      if (widthPercent > 8) {
        var label = document.createElement('span');
        label.className = 'cd-timeline__segment-label';
        label.textContent = seg.title || 'S' + (i + 1);
        block.appendChild(label);
      }

      segmentsBar.appendChild(block);
    }
  }

  /**
   * Actualiza la posición del playhead.
   */
  function updatePlayhead() {
    if (!playhead || !segmentsBar) return;

    var segments = CD.State.get('segments');
    var totalDuration = CD.Utils.getTotalEditedDuration(segments);
    var currentMs = CD.State.get('currentEditedMs');

    if (totalDuration === 0) {
      playhead.style.left = '0%';
      return;
    }

    var percent = Math.min(100, Math.max(0, (currentMs / totalDuration) * 100));
    playhead.style.left = percent + '%';

    // Actualizar display de tiempo
    if (timeDisplay) {
      timeDisplay.textContent = CD.Utils.formatTime(currentMs);
    }

    // Actualizar botón play/pause
    var playBtn = document.getElementById('cd-play-btn');
    if (playBtn) {
      var isPlaying = CD.State.get('isPlaying');
      playBtn.innerHTML = isPlaying
        ? '<span class="cd-icon-pause">&#10074;&#10074;</span>'
        : '<span class="cd-icon-play">&#9654;</span>';
    }
  }

  /**
   * Eventos de click y drag en la barra.
   */
  function bindEvents() {
    if (!container) return;

    var barWrapper = container.querySelector('.cd-timeline__bar-wrapper');
    if (!barWrapper) return;

    barWrapper.addEventListener('mousedown', function(e) {
      isDragging = true;
      seekFromEvent(e, barWrapper);
    });

    document.addEventListener('mousemove', function(e) {
      if (isDragging) {
        seekFromEvent(e, barWrapper);
      }
    });

    document.addEventListener('mouseup', function() {
      isDragging = false;
    });

    // Touch support
    barWrapper.addEventListener('touchstart', function(e) {
      isDragging = true;
      seekFromEvent(e.touches[0], barWrapper);
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
      if (isDragging) {
        seekFromEvent(e.touches[0], barWrapper);
      }
    }, { passive: true });

    document.addEventListener('touchend', function() {
      isDragging = false;
    });
  }

  function seekFromEvent(e, barWrapper) {
    var rect = barWrapper.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var percent = Math.max(0, Math.min(1, x / rect.width));

    var segments = CD.State.get('segments');
    var totalDuration = CD.Utils.getTotalEditedDuration(segments);
    var editedMs = Math.round(percent * totalDuration);

    CD.Player.seekToEditedTime(editedMs);
  }

  // API pública
  return {
    init: init,
    renderSegments: renderSegments,
    updatePlayhead: updatePlayhead
  };

})();
