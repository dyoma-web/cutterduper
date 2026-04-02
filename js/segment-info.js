/**
 * CutterDuper — Panel de Info del Segmento Actual
 * =================================================
 * Visible para TODOS los usuarios (editor y visualizador).
 * Muestra nombre del segmento, categoria, tiempos, progreso.
 */
var CD = window.CD || {};

CD.SegmentInfo = (function() {

  var container = null;

  function init(containerId) {
    container = document.getElementById(containerId);
    if (!container) return;

    render();

    CD.State.on('currentSourceMs', update);
    CD.State.on('segments', update);
    CD.State.on('categories', update);
  }

  function render() {
    container.innerHTML = '';
    container.className = 'cd-seginfo';

    container.innerHTML =
      '<div class="cd-seginfo__header"><h3>Segmento actual</h3></div>' +
      '<div class="cd-seginfo__content" id="cd-seginfo-content">' +
        '<div class="cd-seginfo__empty">Reproduce el video para ver la informacion del segmento.</div>' +
      '</div>' +
      '<div class="cd-seginfo__list-header"><h4>Todos los segmentos</h4></div>' +
      '<div class="cd-seginfo__list" id="cd-seginfo-list"></div>';

    update();
  }

  function update() {
    if (!container) return;

    var segments = CD.State.get('segments');
    var currentSourceMs = CD.State.get('currentSourceMs');
    var categories = CD.State.get('categories') || [];
    var contentEl = document.getElementById('cd-seginfo-content');
    var listEl = document.getElementById('cd-seginfo-list');

    if (!contentEl) return;

    // Find which segment we're in
    var activeSeg = null;
    var activeIdx = -1;
    // Use currentSegmentIndex from state if overlay is active (slide)
    var stateIdx = CD.State.get('currentSegmentIndex');
    if (segments && segments.length > 0) {
      if (stateIdx >= 0 && stateIdx < segments.length) {
        var candidate = segments[stateIdx];
        var cType = String(candidate.type || 'video');
        if (cType !== 'video' && CD.Overlay && CD.Overlay.isActive()) {
          activeSeg = candidate;
          activeIdx = stateIdx;
        }
      }
      if (!activeSeg) {
        for (var i = 0; i < segments.length; i++) {
          var s = segments[i];
          if (String(s.type || 'video') === 'video') {
            if (currentSourceMs >= Number(s.source_start_ms) && currentSourceMs < Number(s.source_end_ms)) {
              activeSeg = s;
              activeIdx = i;
              break;
            }
          }
        }
      }
    }

    // Current segment info
    if (activeSeg) {
      var cat = null;
      if (activeSeg.category_id && String(activeSeg.category_id).trim()) {
        cat = categories.find(function(c) { return String(c.id) === String(activeSeg.category_id); });
      }

      var segDuration = Number(activeSeg.source_end_ms) - Number(activeSeg.source_start_ms);
      var segProgress = currentSourceMs - Number(activeSeg.source_start_ms);
      var progressPct = Math.min(100, Math.max(0, (segProgress / segDuration) * 100));

      var catHtml = '';
      if (cat) {
        catHtml = '<div class="cd-seginfo__category">' +
          '<span class="cd-seginfo__cat-dot" style="background:' + (cat.color || '#ccc') + '"></span>' +
          '<span>' + cat.name + '</span></div>';
      }

      contentEl.innerHTML =
        '<div class="cd-seginfo__active">' +
          '<div class="cd-seginfo__name">' + (activeSeg.title || 'Segmento ' + (activeIdx + 1)) + '</div>' +
          catHtml +
          '<div class="cd-seginfo__times">' +
            '<span>' + CD.Utils.formatTime(Number(activeSeg.source_start_ms)) + '</span>' +
            '<span class="cd-seginfo__arrow">-></span>' +
            '<span>' + CD.Utils.formatTime(Number(activeSeg.source_end_ms)) + '</span>' +
          '</div>' +
          '<div class="cd-seginfo__progress-bar">' +
            '<div class="cd-seginfo__progress-fill" style="width:' + progressPct + '%;background:' + getColor(activeSeg, activeIdx, categories) + '"></div>' +
          '</div>' +
          '<div class="cd-seginfo__progress-text">' + CD.Utils.formatTime(segProgress) + ' / ' + CD.Utils.formatTime(segDuration) + '</div>' +
        '</div>';
    } else {
      if (!segments || segments.length === 0) {
        contentEl.innerHTML = '<div class="cd-seginfo__empty">No hay segmentos definidos.</div>';
      } else {
        contentEl.innerHTML = '<div class="cd-seginfo__empty cd-seginfo__between">Fuera de segmento</div>';
      }
    }

    // Segment list (always visible, for all users)
    if (listEl) {
      renderSegmentList(listEl, segments, categories, activeIdx);
    }
  }

  function renderSegmentList(listEl, segments, categories, activeIdx) {
    if (!segments || segments.length === 0) {
      listEl.innerHTML = '<div class="cd-seginfo__empty">Sin segmentos.</div>';
      return;
    }

    listEl.innerHTML = '';
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var color = getColor(seg, i, categories);
      var cat = null;
      if (seg.category_id && String(seg.category_id).trim()) {
        cat = categories.find(function(c) { return String(c.id) === String(seg.category_id); });
      }

      var item = document.createElement('div');
      item.className = 'cd-seginfo__item';
      if (i === activeIdx) item.classList.add('cd-seginfo__item--active');
      item.style.borderLeftColor = color;
      item.dataset.index = i;

      var catBadge = '';
      if (cat) {
        catBadge = '<span class="cd-editor__cat-badge" style="background:' + (cat.color || '#ccc') + '">' + cat.name + '</span> ';
      }

      var sType = String(seg.type || 'video');
      var typeBadge = sType !== 'video' ? '<span class="cd-seginfo__type-badge">SLIDE</span> ' : '';
      var timeInfo = sType === 'video'
        ? CD.Utils.formatTime(Number(seg.source_start_ms)) + ' -> ' + CD.Utils.formatTime(Number(seg.source_end_ms))
        : CD.Utils.formatTime(Number(seg.duration_ms) || 5000) + ' (slide)';

      item.innerHTML =
        '<div class="cd-seginfo__item-name">' + typeBadge + catBadge + (seg.title || 'Segmento ' + (i + 1)) + '</div>' +
        '<div class="cd-seginfo__item-time">' + timeInfo + '</div>';

      // Click to jump
      item.addEventListener('click', (function(idx) {
        return function() {
          CD.Player.jumpToSegment(idx);
        };
      })(i));

      listEl.appendChild(item);
    }
  }

  function getColor(seg, index, categories) {
    var DEFAULT = ['#3b82f6','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#6366f1'];
    if (seg.category_id && String(seg.category_id).trim()) {
      var cat = categories.find(function(c) { return String(c.id) === String(seg.category_id); });
      if (cat && cat.color) return cat.color;
    }
    if (seg.color && String(seg.color).trim()) return String(seg.color);
    return DEFAULT[index % DEFAULT.length];
  }

  return { init: init, update: update };

})();
