/**
 * CutterDuper — Timeline UI
 * ==========================
 * - Barra sobre duracion total del video
 * - Segmentos como bloques coloreados (con colores de categoria)
 * - Marcadores de comentarios (toggle on/off)
 * - Preview fade de segmento en creacion
 * - Handles arrastrables para editar segmentos (solo en modo editor)
 */
var CD = window.CD || {};

CD.TimelineUI = (function() {

  var container = null;
  var barEl = null;
  var playhead = null;
  var timeDisplay = null;
  var durationDisplay = null;
  var isDragging = false;
  var dragHandle = null; // { segmentId, edge: 'start'|'end' }

  var DEFAULT_COLORS = [
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
    CD.State.on('comments', renderCommentMarkers);
    CD.State.on('showCommentMarkers', renderCommentMarkers);
    CD.State.on('categories', renderSegments);
    CD.State.on('isEditing', renderSegments);
    CD.State.on('editingSegmentId', renderSegments);
  }

  function getSegmentColor(seg, index) {
    // Priority: category color > segment custom color > default rotation
    if (seg.category_id && String(seg.category_id).trim()) {
      var categories = CD.State.get('categories') || [];
      var cat = categories.find(function(c) { return String(c.id) === String(seg.category_id); });
      if (cat && cat.color) return cat.color;
    }
    if (seg.color && String(seg.color).trim()) return String(seg.color);
    return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
  }

  function render() {
    container.innerHTML = '';
    container.className = 'cd-timeline';

    // Controls
    var controls = document.createElement('div');
    controls.className = 'cd-timeline__controls';

    var playBtn = document.createElement('button');
    playBtn.className = 'cd-btn cd-btn--play';
    playBtn.id = 'cd-play-btn';
    playBtn.innerHTML = '<span class="cd-icon-play">&#9654;</span>';
    playBtn.title = 'Play / Pause';
    playBtn.addEventListener('click', function() { CD.Player.togglePlayPause(); });

    timeDisplay = document.createElement('span');
    timeDisplay.className = 'cd-timeline__time';
    timeDisplay.textContent = '00:00';

    var sep = document.createElement('span');
    sep.className = 'cd-timeline__separator';
    sep.textContent = ' / ';

    durationDisplay = document.createElement('span');
    durationDisplay.className = 'cd-timeline__duration';
    durationDisplay.textContent = '00:00';

    controls.appendChild(playBtn);
    controls.appendChild(timeDisplay);
    controls.appendChild(sep);
    controls.appendChild(durationDisplay);

    // Comment markers toggle
    var commentToggle = document.createElement('div');
    commentToggle.className = 'cd-timeline__mode';

    var commentLabel = document.createElement('label');
    commentLabel.className = 'cd-timeline__mode-label';
    commentLabel.textContent = 'Comentarios';

    var commentBtn = document.createElement('button');
    commentBtn.className = 'cd-timeline__mode-toggle' + (CD.State.get('showCommentMarkers') ? ' active' : '');
    commentBtn.id = 'cd-comment-markers-toggle';
    commentBtn.title = 'Mostrar/ocultar marcadores de comentarios';
    commentBtn.addEventListener('click', function() {
      var current = CD.State.get('showCommentMarkers');
      CD.State.set({ showCommentMarkers: !current });
      commentBtn.classList.toggle('active', !current);
    });

    commentToggle.appendChild(commentLabel);
    commentToggle.appendChild(commentBtn);
    controls.appendChild(commentToggle);

    // Playback mode toggle
    var modeDiv = document.createElement('div');
    modeDiv.className = 'cd-timeline__mode';

    var modeLabel = document.createElement('label');
    modeLabel.className = 'cd-timeline__mode-label';
    modeLabel.textContent = 'Solo bloques';

    var modeToggle = document.createElement('button');
    modeToggle.className = 'cd-timeline__mode-toggle' + (CD.State.get('playbackMode') === 'segments' ? ' active' : '');
    modeToggle.id = 'cd-mode-toggle';
    modeToggle.addEventListener('click', function() {
      var next = CD.State.get('playbackMode') === 'full' ? 'segments' : 'full';
      CD.State.set({ playbackMode: next });
      modeToggle.classList.toggle('active', next === 'segments');
    });

    modeDiv.appendChild(modeLabel);
    modeDiv.appendChild(modeToggle);
    controls.appendChild(modeDiv);

    // Bar
    var barWrapper = document.createElement('div');
    barWrapper.className = 'cd-timeline__bar-wrapper';
    barWrapper.id = 'cd-timeline-bar-wrapper';

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

  function renderSegments() {
    if (!barEl) return;
    barEl.innerHTML = '';

    var totalMs = CD.State.get('videoDurationMs') || CD.Player.getVideoDuration();
    if (totalMs <= 0) {
      setTimeout(function() {
        var dur = CD.Player.getVideoDuration();
        if (dur > 0) CD.State.set({ videoDurationMs: dur });
      }, 1000);
      if (durationDisplay) durationDisplay.textContent = '--:--';
      return;
    }

    if (durationDisplay) durationDisplay.textContent = CD.Utils.formatTime(totalMs);

    var segments = CD.State.get('segments');
    var isEditing = CD.State.get('isEditing');
    var editingId = CD.State.get('editingSegmentId');

    if (segments && segments.length > 0) {
      for (var i = 0; i < segments.length; i++) {
        var seg = segments[i];
        var startMs = Number(seg.source_start_ms);
        var endMs = Number(seg.source_end_ms);
        var leftPct = (startMs / totalMs) * 100;
        var widthPct = ((endMs - startMs) / totalMs) * 100;
        var color = getSegmentColor(seg, i);

        var block = document.createElement('div');
        block.className = 'cd-timeline__segment';
        if (editingId && String(seg.id) === String(editingId)) {
          block.classList.add('cd-timeline__segment--editing');
        }
        block.style.left = leftPct + '%';
        block.style.width = widthPct + '%';
        block.style.backgroundColor = color;
        block.dataset.index = i;
        block.dataset.id = seg.id;
        block.title = (seg.title || 'Segmento ' + (i + 1)) +
          '\n' + CD.Utils.formatTime(startMs) + ' -> ' + CD.Utils.formatTime(endMs);

        if (widthPct > 5) {
          var label = document.createElement('span');
          label.className = 'cd-timeline__segment-label';
          label.textContent = seg.title || 'S' + (i + 1);
          block.appendChild(label);
        }

        // Drag handles (only in edit mode)
        if (isEditing) {
          var handleL = document.createElement('div');
          handleL.className = 'cd-timeline__handle cd-timeline__handle--left';
          handleL.dataset.segId = seg.id;
          handleL.dataset.edge = 'start';
          block.appendChild(handleL);

          var handleR = document.createElement('div');
          handleR.className = 'cd-timeline__handle cd-timeline__handle--right';
          handleR.dataset.segId = seg.id;
          handleR.dataset.edge = 'end';
          block.appendChild(handleR);
        }

        barEl.appendChild(block);
      }
    }

    // Comment markers
    renderCommentMarkers();
  }

  function renderCommentMarkers() {
    if (!barEl) return;

    // Remove existing markers
    var existing = barEl.querySelectorAll('.cd-timeline__comment-marker');
    for (var k = 0; k < existing.length; k++) existing[k].remove();

    if (!CD.State.get('showCommentMarkers')) return;

    var totalMs = CD.State.get('videoDurationMs') || CD.Player.getVideoDuration();
    if (totalMs <= 0) return;

    var comments = CD.State.get('comments');
    if (!comments || comments.length === 0) return;

    for (var i = 0; i < comments.length; i++) {
      var c = comments[i];
      var sourceMs = Number(c.source_time_ms);
      var leftPct = (sourceMs / totalMs) * 100;

      var marker = document.createElement('div');
      marker.className = 'cd-timeline__comment-marker';
      marker.style.left = leftPct + '%';
      marker.title = c.author_label + ': ' + c.text.substring(0, 60);
      barEl.appendChild(marker);
    }
  }

  /**
   * Shows a preview block on the timeline (semi-transparent, pulsing).
   * Called from editor when user types start/end times.
   */
  function showPreview(startMs, endMs) {
    removePreview();
    var totalMs = CD.State.get('videoDurationMs') || CD.Player.getVideoDuration();
    if (totalMs <= 0 || isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return;

    var leftPct = (startMs / totalMs) * 100;
    var widthPct = ((endMs - startMs) / totalMs) * 100;

    var preview = document.createElement('div');
    preview.className = 'cd-timeline__segment cd-timeline__segment--preview';
    preview.id = 'cd-segment-preview';
    preview.style.left = leftPct + '%';
    preview.style.width = widthPct + '%';

    if (barEl) barEl.appendChild(preview);
  }

  function removePreview() {
    var el = document.getElementById('cd-segment-preview');
    if (el) el.remove();
  }

  function updatePlayhead() {
    if (!playhead) return;
    var totalMs = CD.State.get('videoDurationMs') || CD.Player.getVideoDuration();
    var currentMs = CD.State.get('currentSourceMs');
    if (totalMs <= 0) { playhead.style.left = '0%'; return; }
    playhead.style.left = Math.min(100, Math.max(0, (currentMs / totalMs) * 100)) + '%';
    if (timeDisplay) timeDisplay.textContent = CD.Utils.formatTime(currentMs);
  }

  function updatePlayButton() {
    var playBtn = document.getElementById('cd-play-btn');
    if (playBtn) {
      playBtn.innerHTML = CD.State.get('isPlaying')
        ? '<span class="cd-icon-pause">&#10074;&#10074;</span>'
        : '<span class="cd-icon-play">&#9654;</span>';
    }
  }

  function bindEvents() {
    if (!container) return;
    var barWrapper = document.getElementById('cd-timeline-bar-wrapper') || container.querySelector('.cd-timeline__bar-wrapper');
    if (!barWrapper) return;

    barWrapper.addEventListener('mousedown', function(e) {
      // Check if clicking a drag handle
      var handle = e.target.closest('.cd-timeline__handle');
      if (handle && CD.State.get('isEditing')) {
        dragHandle = { segmentId: handle.dataset.segId, edge: handle.dataset.edge };
        e.preventDefault();
        return;
      }
      isDragging = true;
      seekFromEvent(e, barWrapper);
    });

    document.addEventListener('mousemove', function(e) {
      if (dragHandle) {
        handleDragMove(e, barWrapper);
        return;
      }
      if (isDragging) seekFromEvent(e, barWrapper);
    });

    document.addEventListener('mouseup', function() {
      if (dragHandle) {
        handleDragEnd();
        dragHandle = null;
        return;
      }
      isDragging = false;
    });

    barWrapper.addEventListener('touchstart', function(e) {
      isDragging = true;
      seekFromEvent(e.touches[0], barWrapper);
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
      if (isDragging) seekFromEvent(e.touches[0], barWrapper);
    }, { passive: true });

    document.addEventListener('touchend', function() { isDragging = false; });
  }

  function seekFromEvent(e, barWrapper) {
    var rect = barWrapper.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var percent = Math.max(0, Math.min(1, x / rect.width));
    var totalMs = CD.State.get('videoDurationMs') || CD.Player.getVideoDuration();
    if (totalMs <= 0) return;
    CD.Player.seekToSourceDirect(Math.round(percent * totalMs));
  }

  // ============================================================
  // DRAG HANDLES FOR SEGMENT EDITING
  // ============================================================
  var dragStartData = null;

  function handleDragMove(e, barWrapper) {
    if (!dragHandle) return;
    var rect = barWrapper.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var percent = Math.max(0, Math.min(1, x / rect.width));
    var totalMs = CD.State.get('videoDurationMs') || CD.Player.getVideoDuration();
    if (totalMs <= 0) return;

    var newMs = Math.round(percent * totalMs);
    var segments = CD.State.get('segments');
    var seg = segments.find(function(s) { return String(s.id) === String(dragHandle.segmentId); });
    if (!seg) return;

    // Live update the visual position
    var block = barEl.querySelector('[data-id="' + dragHandle.segmentId + '"]');
    if (!block) return;

    var startMs = Number(seg.source_start_ms);
    var endMs = Number(seg.source_end_ms);

    if (dragHandle.edge === 'start') {
      startMs = Math.max(0, Math.min(newMs, endMs - 500));
    } else {
      endMs = Math.max(startMs + 500, Math.min(newMs, totalMs));
    }

    var leftPct = (startMs / totalMs) * 100;
    var widthPct = ((endMs - startMs) / totalMs) * 100;
    block.style.left = leftPct + '%';
    block.style.width = widthPct + '%';

    dragStartData = { segmentId: dragHandle.segmentId, edge: dragHandle.edge, newMs: newMs };
  }

  function handleDragEnd() {
    if (!dragStartData) return;

    var segments = CD.State.get('segments');
    var seg = segments.find(function(s) { return String(s.id) === String(dragStartData.segmentId); });
    if (!seg) { dragStartData = null; return; }

    var startMs = Number(seg.source_start_ms);
    var endMs = Number(seg.source_end_ms);
    var totalMs = CD.State.get('videoDurationMs') || CD.Player.getVideoDuration();

    if (dragStartData.edge === 'start') {
      startMs = Math.max(0, Math.min(dragStartData.newMs, endMs - 500));
    } else {
      endMs = Math.max(startMs + 500, Math.min(dragStartData.newMs, totalMs));
    }

    var projectId = CD.State.get('project').id;
    CD.API.saveSegment(projectId, {
      id: seg.id,
      title: seg.title || '',
      source_start_ms: startMs,
      source_end_ms: endMs,
      category_id: seg.category_id || '',
      color: seg.color || ''
    }).then(function() {
      return CD.API.getSegments(projectId);
    }).then(function(data) {
      CD.State.set({ segments: CD.Utils.buildEditedTimeline(data.segments) });
    }).catch(function(err) {
      alert('Error al guardar: ' + err.message);
      renderSegments();
    });

    dragStartData = null;
  }

  return {
    init: init,
    renderSegments: renderSegments,
    updatePlayhead: updatePlayhead,
    showPreview: showPreview,
    removePreview: removePreview
  };

})();
