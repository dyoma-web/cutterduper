/**
 * CutterDuper — Timeline UI
 * ==========================
 * Barra visual que muestra la duración TOTAL del video fuente.
 * Los segmentos se dibujan como bloques coloreados ENCIMA de la barra.
 * Toggle para alternar entre reproducir video completo o solo segmentos.
 */
var CD = window.CD || {};

CD.TimelineUI = (function() {

  var container = null;
  var barEl = null;
  var playhead = null;
  var timeDisplay = null;
  var durationDisplay = null;
  var isDragging = false;

  var SEGMENT_COLORS = [
    '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981',
    '#f59e0b', '#ef4444', '#ec4899', '#6366f1'
  ];

  function init(containerId) {
    container = document.getElementById(containerId);
    if (!container) return;

    render();
    bindEvents();

    CD.State.on('segments', renderSegments);
    CD.State.on('currentSourceMs', updatePlayhead);
    CD.State.on('isPlaying', updatePlayButton);
    CD.State.on('videoDurationMs', renderSegments);
  }

  function render() {
    container.innerHTML = '';
    container.className = 'cd-timeline';

    // Controles
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

    // Toggle de modo
    var modeDiv = document.createElement('div');
    modeDiv.className = 'cd-timeline__mode';

    var modeLabel = document.createElement('label');
    modeLabel.className = 'cd-timeline__mode-label';
    modeLabel.textContent = 'Solo bloques';
    modeLabel.htmlFor = 'cd-mode-toggle';

    var modeToggle = document.createElement('button');
    modeToggle.className = 'cd-timeline__mode-toggle';
    modeToggle.id = 'cd-mode-toggle';
    modeToggle.title = 'Alternar: reproducir video completo o solo bloques seleccionados';
    if (CD.State.get('playbackMode') === 'segments') {
      modeToggle.classList.add('active');
    }

    modeToggle.addEventListener('click', function() {
      var current = CD.State.get('playbackMode');
      var next = current === 'full' ? 'segments' : 'full';
      CD.State.set({ playbackMode: next });
      modeToggle.classList.toggle('active', next === 'segments');
    });

    modeDiv.appendChild(modeLabel);
    modeDiv.appendChild(modeToggle);
    controls.appendChild(modeDiv);

    // Barra
    var barWrapper = document.createElement('div');
    barWrapper.className = 'cd-timeline__bar-wrapper';

    barEl = document.createElement('div');
    barEl.className = 'cd-timeline__bar';

    playhead = document.createElement('div');
    playhead.className = 'cd-timeline__playhead';

    barWrapper.appendChild(barEl);
    barWrapper.appendChild(playhead);

    container.appendChild(controls);
    container.appendChild(barWrapper);

    renderSegments();
  }

  /**
   * Renderiza segmentos como bloques posicionados sobre la barra de duración total.
   */
  function renderSegments() {
    if (!barEl) return;
    barEl.innerHTML = '';

    var totalMs = CD.State.get('videoDurationMs') || CD.Player.getVideoDuration();
    if (totalMs <= 0) {
      // Intentar obtener la duración después de un momento
      setTimeout(function() {
        var dur = CD.Player.getVideoDuration();
        if (dur > 0) {
          CD.State.set({ videoDurationMs: dur });
        }
      }, 1000);
      if (durationDisplay) durationDisplay.textContent = '--:--';
      return;
    }

    if (durationDisplay) durationDisplay.textContent = CD.Utils.formatTime(totalMs);

    var segments = CD.State.get('segments');
    if (!segments || segments.length === 0) return;

    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var startMs = Number(seg.source_start_ms);
      var endMs = Number(seg.source_end_ms);
      var leftPercent = (startMs / totalMs) * 100;
      var widthPercent = ((endMs - startMs) / totalMs) * 100;

      var block = document.createElement('div');
      block.className = 'cd-timeline__segment';
      block.style.left = leftPercent + '%';
      block.style.width = widthPercent + '%';
      block.style.backgroundColor = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
      block.dataset.index = i;
      block.title = (seg.title || 'Segmento ' + (i + 1)) +
        '\n' + CD.Utils.formatTime(startMs) + ' → ' + CD.Utils.formatTime(endMs);

      if (widthPercent > 5) {
        var label = document.createElement('span');
        label.className = 'cd-timeline__segment-label';
        label.textContent = seg.title || 'S' + (i + 1);
        block.appendChild(label);
      }

      barEl.appendChild(block);
    }
  }

  /**
   * Actualiza playhead basado en source time (posición real del video).
   */
  function updatePlayhead() {
    if (!playhead) return;

    var totalMs = CD.State.get('videoDurationMs') || CD.Player.getVideoDuration();
    var currentMs = CD.State.get('currentSourceMs');

    if (totalMs <= 0) {
      playhead.style.left = '0%';
      return;
    }

    var percent = Math.min(100, Math.max(0, (currentMs / totalMs) * 100));
    playhead.style.left = percent + '%';

    if (timeDisplay) {
      timeDisplay.textContent = CD.Utils.formatTime(currentMs);
    }
  }

  function updatePlayButton() {
    var playBtn = document.getElementById('cd-play-btn');
    if (playBtn) {
      var isPlaying = CD.State.get('isPlaying');
      playBtn.innerHTML = isPlaying
        ? '<span class="cd-icon-pause">&#10074;&#10074;</span>'
        : '<span class="cd-icon-play">&#9654;</span>';
    }
  }

  function bindEvents() {
    if (!container) return;

    var barWrapper = container.querySelector('.cd-timeline__bar-wrapper');
    if (!barWrapper) return;

    barWrapper.addEventListener('mousedown', function(e) {
      isDragging = true;
      seekFromEvent(e, barWrapper);
    });

    document.addEventListener('mousemove', function(e) {
      if (isDragging) seekFromEvent(e, barWrapper);
    });

    document.addEventListener('mouseup', function() {
      isDragging = false;
    });

    barWrapper.addEventListener('touchstart', function(e) {
      isDragging = true;
      seekFromEvent(e.touches[0], barWrapper);
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
      if (isDragging) seekFromEvent(e.touches[0], barWrapper);
    }, { passive: true });

    document.addEventListener('touchend', function() {
      isDragging = false;
    });
  }

  function seekFromEvent(e, barWrapper) {
    var rect = barWrapper.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var percent = Math.max(0, Math.min(1, x / rect.width));

    var totalMs = CD.State.get('videoDurationMs') || CD.Player.getVideoDuration();
    if (totalMs <= 0) return;

    var sourceMs = Math.round(percent * totalMs);

    // Seek directo al source time
    CD.Player.seekToSourceDirect(sourceMs);
  }

  return {
    init: init,
    renderSegments: renderSegments,
    updatePlayhead: updatePlayhead
  };

})();
