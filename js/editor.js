/**
 * CutterDuper — Panel de Edicion
 * ================================
 * CRUD segmentos, categorias, unlock/lock, reordenamiento.
 * Highlighting del segmento activo y del segmento en edicion.
 */
var CD = window.CD || {};

CD.Editor = (function() {

  var container = null;
  var segmentListEl = null;
  var formEl = null;
  var editingSegmentId = null;

  function init(containerId) {
    container = document.getElementById(containerId);
    if (!container) return;
    render();

    CD.State.on('isEditing', function() { render(); });
    CD.State.on('segments', function() { if (CD.State.get('isEditing')) renderSegmentList(); });
    CD.State.on('currentSegmentIndex', highlightActiveSegment);
    CD.State.on('currentSourceMs', highlightActiveSegment);
    CD.State.on('categories', function() { if (CD.State.get('isEditing')) render(); });
  }

  function render() {
    if (!container) return;
    container.innerHTML = '';
    if (!CD.State.get('isEditing')) {
      renderLockScreen();
    } else {
      renderEditorPanel();
    }
  }

  function renderLockScreen() {
    var wrapper = document.createElement('div');
    wrapper.className = 'cd-editor__lock';
    wrapper.innerHTML =
      '<h3>Modo Editor</h3>' +
      '<p>Ingresa el PIN para editar segmentos.</p>' +
      '<div class="cd-editor__pin-form">' +
        '<input type="password" id="cd-pin-input" class="cd-input" placeholder="PIN de edicion" maxlength="20">' +
        '<button id="cd-pin-submit" class="cd-btn cd-btn--primary">Desbloquear</button>' +
      '</div>' +
      '<div id="cd-pin-error" class="cd-error" style="display:none"></div>';
    container.appendChild(wrapper);

    document.getElementById('cd-pin-submit').addEventListener('click', handleUnlock);
    document.getElementById('cd-pin-input').addEventListener('keydown', function(e) { if (e.key === 'Enter') handleUnlock(); });
  }

  function renderEditorPanel() {
    container.innerHTML = '';

    // Header
    var header = document.createElement('div');
    header.className = 'cd-editor__header';
    header.innerHTML = '<h3>Editor de Segmentos</h3><button id="cd-lock-btn" class="cd-btn cd-btn--sm cd-btn--secondary">Cerrar sesion</button>';
    container.appendChild(header);

    // Categories manager
    renderCategoriesSection();

    // Segment form
    renderSegmentForm();

    // Segment list
    var listWrapper = document.createElement('div');
    listWrapper.className = 'cd-editor__segments';
    listWrapper.innerHTML = '<h4>Segmentos definidos</h4>';
    segmentListEl = document.createElement('div');
    segmentListEl.className = 'cd-editor__segment-list';
    listWrapper.appendChild(segmentListEl);
    container.appendChild(listWrapper);

    bindEditorEvents();
    renderSegmentList();
  }

  // ============================================================
  // CATEGORIES
  // ============================================================
  function renderCategoriesSection() {
    var section = document.createElement('div');
    section.className = 'cd-editor__form cd-editor__categories';
    section.innerHTML = '<h4>Categorias <button id="cd-cat-toggle" class="cd-btn cd-btn--xs cd-btn--secondary">+</button></h4>';

    var catList = document.createElement('div');
    catList.className = 'cd-editor__cat-list';
    catList.id = 'cd-cat-list';

    var categories = CD.State.get('categories') || [];
    for (var i = 0; i < categories.length; i++) {
      var cat = categories[i];
      var item = document.createElement('div');
      item.className = 'cd-editor__cat-item';
      item.innerHTML =
        '<span class="cd-editor__cat-color" style="background:' + (cat.color || '#ccc') + '"></span>' +
        '<span>' + (cat.name || '') + '</span>' +
        '<button class="cd-btn cd-btn--xs cd-btn--danger" data-cat-delete="' + cat.id + '">x</button>';
      catList.appendChild(item);
    }
    section.appendChild(catList);

    // Add category form (hidden by default)
    var catForm = document.createElement('div');
    catForm.id = 'cd-cat-form';
    catForm.style.display = 'none';
    catForm.className = 'cd-editor__cat-form';
    catForm.innerHTML =
      '<input type="text" id="cd-cat-name" class="cd-input cd-input--sm" placeholder="Nombre" maxlength="50">' +
      '<input type="color" id="cd-cat-color" value="#3b82f6" class="cd-input-color">' +
      '<button id="cd-cat-save" class="cd-btn cd-btn--xs cd-btn--primary">Guardar</button>';
    section.appendChild(catForm);

    container.appendChild(section);
  }

  // ============================================================
  // SEGMENT FORM
  // ============================================================
  function renderSegmentForm() {
    formEl = document.createElement('div');
    formEl.className = 'cd-editor__form';

    var currentTime = CD.Utils.formatTimePrecise(CD.State.get('currentSourceMs'));
    var categories = CD.State.get('categories') || [];

    var catOptions = '<option value="">Sin categoria</option>';
    for (var i = 0; i < categories.length; i++) {
      catOptions += '<option value="' + categories[i].id + '">' + categories[i].name + '</option>';
    }

    var transOptions =
      '<option value="direct_cut">Corte directo</option>' +
      '<option value="fade_black">Fade a negro</option>' +
      '<option value="fade_white">Fade a blanco</option>';

    formEl.innerHTML =
      '<h4 id="cd-seg-form-title">Nuevo segmento</h4>' +
      // Type selector
      '<div class="cd-form-grid cd-form-grid--2" style="margin-bottom:0.5rem">' +
        '<label>Tipo<select id="cd-seg-type" class="cd-input">' +
          '<option value="video">Video</option>' +
          '<option value="slide_text">Slide: Texto</option>' +
          '<option value="slide_image">Slide: Imagen</option>' +
          '<option value="slide_mixed">Slide: Texto + Imagen</option>' +
        '</select></label>' +
        '<label>Titulo<input type="text" id="cd-seg-title" class="cd-input" placeholder="Ej: Introduccion" maxlength="200"></label>' +
      '</div>' +
      // Video fields
      '<div id="cd-seg-video-fields" class="cd-form-grid">' +
        '<label>Inicio (fuente)' +
          '<div style="display:flex;gap:4px;">' +
            '<input type="text" id="cd-seg-start" class="cd-input" placeholder="MM:SS" value="' + currentTime + '">' +
            '<button id="cd-seg-use-start" class="cd-btn cd-btn--xs cd-btn--secondary">Ahora</button>' +
          '</div>' +
        '</label>' +
        '<label>Fin (fuente)' +
          '<div style="display:flex;gap:4px;">' +
            '<input type="text" id="cd-seg-end" class="cd-input" placeholder="MM:SS">' +
            '<button id="cd-seg-use-end" class="cd-btn cd-btn--xs cd-btn--secondary">Ahora</button>' +
          '</div>' +
        '</label>' +
      '</div>' +
      // Slide fields (hidden by default)
      '<div id="cd-seg-slide-fields" style="display:none">' +
        '<div class="cd-form-grid">' +
          '<label>Duracion (seg)<input type="number" id="cd-seg-duration" class="cd-input" value="5" min="1" max="30"></label>' +
          '<label>Color fondo<input type="color" id="cd-seg-bg-color" class="cd-input-color" value="#1a1d27"></label>' +
          '<label>Color texto<input type="color" id="cd-seg-text-color" class="cd-input-color" value="#ffffff"></label>' +
        '</div>' +
        '<div id="cd-seg-slide-text-fields">' +
          '<div class="cd-form-grid cd-form-grid--2">' +
            '<label>Subtitulo<input type="text" id="cd-seg-subtitle" class="cd-input" placeholder="Subtitulo (opcional)" maxlength="200"></label>' +
            '<label>Cuerpo<textarea id="cd-seg-body" class="cd-input" placeholder="Texto del slide" rows="2" maxlength="500"></textarea></label>' +
          '</div>' +
        '</div>' +
        '<div id="cd-seg-slide-image-fields" style="display:none">' +
          '<label>URL de imagen<input type="text" id="cd-seg-image-url" class="cd-input" placeholder="https://..."></label>' +
          '<label>Pie de imagen<input type="text" id="cd-seg-caption" class="cd-input" placeholder="Descripcion (opcional)" maxlength="200"></label>' +
        '</div>' +
      '</div>' +
      // Transitions
      '<div class="cd-form-grid" style="margin-top:0.5rem">' +
        '<label>Transicion entrada<select id="cd-seg-trans-in" class="cd-input">' + transOptions + '</select></label>' +
        '<label>Fade entrada (seg)<input type="number" id="cd-seg-fade-in" class="cd-input" value="0.8" min="0.3" max="3" step="0.1"></label>' +
        '<label>Transicion salida<select id="cd-seg-trans-out" class="cd-input">' + transOptions + '</select></label>' +
      '</div>' +
      '<div class="cd-form-grid" style="margin-top:0.3rem">' +
        '<label>Fade salida (seg)<input type="number" id="cd-seg-fade-out" class="cd-input" value="0.8" min="0.3" max="3" step="0.1"></label>' +
        '<label>Categoria<select id="cd-seg-category" class="cd-input">' + catOptions + '</select></label>' +
      '</div>' +
      '<div class="cd-form-grid cd-form-grid--2" style="margin-top:0.3rem">' +
        '<label>Color (opcional)<input type="color" id="cd-seg-color" class="cd-input-color" value="#3b82f6"></label>' +
        '<span></span>' +
      '</div>' +
      '<div class="cd-editor__form-actions">' +
        '<button id="cd-seg-save" class="cd-btn cd-btn--primary">Agregar segmento</button>' +
        '<button id="cd-seg-cancel" class="cd-btn cd-btn--secondary" style="display:none">Cancelar</button>' +
      '</div>' +
      '<div id="cd-seg-error" class="cd-error" style="display:none"></div>';
    container.appendChild(formEl);
  }

  // ============================================================
  // SEGMENT LIST with highlighting
  // ============================================================
  function renderSegmentList() {
    if (!segmentListEl) return;
    var segments = CD.State.get('segments');

    if (!segments || segments.length === 0) {
      segmentListEl.innerHTML = '<div class="cd-editor__empty">No hay segmentos. Agrega el primero arriba.</div>';
      return;
    }

    segmentListEl.innerHTML = '';
    var currentSourceMs = CD.State.get('currentSourceMs');
    var editingId = CD.State.get('editingSegmentId');

    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var isActive = currentSourceMs >= Number(seg.source_start_ms) && currentSourceMs < Number(seg.source_end_ms);
      var isEditingThis = editingId && String(seg.id) === String(editingId);
      var color = getSegmentColorForList(seg, i);

      var item = document.createElement('div');
      item.className = 'cd-editor__segment-item';
      if (isActive) item.classList.add('cd-editor__segment-item--active');
      if (isEditingThis) item.classList.add('cd-editor__segment-item--editing');
      item.dataset.id = seg.id;
      item.style.borderLeftColor = color;

      var info = document.createElement('div');
      info.className = 'cd-editor__segment-info';

      var catLabel = '';
      if (seg.category_id && String(seg.category_id).trim()) {
        var categories = CD.State.get('categories') || [];
        var cat = categories.find(function(c) { return String(c.id) === String(seg.category_id); });
        if (cat) catLabel = '<span class="cd-editor__cat-badge" style="background:' + (cat.color || '#ccc') + '">' + cat.name + '</span> ';
      }

      info.innerHTML =
        '<strong>' + catLabel + (seg.title || 'Segmento ' + (i + 1)) + '</strong>' +
        '<span class="cd-editor__segment-times">' +
          CD.Utils.formatTime(Number(seg.source_start_ms)) + ' -> ' +
          CD.Utils.formatTime(Number(seg.source_end_ms)) + ' (fuente)' +
        '</span>';

      var actions = document.createElement('div');
      actions.className = 'cd-editor__segment-actions';

      if (i > 0) actions.appendChild(makeBtn('▲', 'Mover arriba', 'moveUp', null, i));
      if (i < segments.length - 1) actions.appendChild(makeBtn('▼', 'Mover abajo', 'moveDown', null, i));
      actions.appendChild(makeBtn('✎', 'Editar', 'edit', seg.id, i));
      actions.appendChild(makeDangerBtn('x', 'Eliminar', 'delete', seg.id));
      actions.appendChild(makeBtn('▶', 'Preview', 'preview', null, i));

      item.appendChild(info);
      item.appendChild(actions);
      segmentListEl.appendChild(item);
    }
  }

  function makeBtn(text, title, action, id, index) {
    var btn = document.createElement('button');
    btn.className = 'cd-btn cd-btn--xs cd-btn--secondary';
    btn.textContent = text;
    btn.title = title;
    btn.dataset.action = action;
    if (id) btn.dataset.id = id;
    if (index !== undefined) btn.dataset.index = index;
    return btn;
  }

  function makeDangerBtn(text, title, action, id) {
    var btn = document.createElement('button');
    btn.className = 'cd-btn cd-btn--xs cd-btn--danger';
    btn.textContent = text;
    btn.title = title;
    btn.dataset.action = action;
    btn.dataset.id = id;
    return btn;
  }

  function getSegmentColorForList(seg, index) {
    var DEFAULT = ['#3b82f6','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#6366f1'];
    if (seg.category_id && String(seg.category_id).trim()) {
      var categories = CD.State.get('categories') || [];
      var cat = categories.find(function(c) { return String(c.id) === String(seg.category_id); });
      if (cat && cat.color) return cat.color;
    }
    if (seg.color && String(seg.color).trim()) return String(seg.color);
    return DEFAULT[index % DEFAULT.length];
  }

  /**
   * Highlight the segment in the list that is currently playing.
   */
  function highlightActiveSegment() {
    if (!segmentListEl) return;
    var segments = CD.State.get('segments');
    var currentSourceMs = CD.State.get('currentSourceMs');
    var items = segmentListEl.querySelectorAll('.cd-editor__segment-item');

    for (var i = 0; i < items.length; i++) {
      if (i < segments.length) {
        var seg = segments[i];
        var isActive = currentSourceMs >= Number(seg.source_start_ms) && currentSourceMs < Number(seg.source_end_ms);
        items[i].classList.toggle('cd-editor__segment-item--active', isActive);
      }
    }
  }

  // ============================================================
  // EVENTS
  // ============================================================
  function bindEditorEvents() {
    document.getElementById('cd-lock-btn').addEventListener('click', handleLock);
    document.getElementById('cd-seg-save').addEventListener('click', handleSaveSegment);
    document.getElementById('cd-seg-cancel').addEventListener('click', resetForm);

    document.getElementById('cd-seg-use-start').addEventListener('click', function() {
      document.getElementById('cd-seg-start').value = CD.Utils.formatTimePrecise(CD.State.get('currentSourceMs'));
      updatePreview();
    });

    document.getElementById('cd-seg-use-end').addEventListener('click', function() {
      document.getElementById('cd-seg-end').value = CD.Utils.formatTimePrecise(CD.State.get('currentSourceMs'));
      updatePreview();
    });

    // Type selector toggle
    var typeSelect = document.getElementById('cd-seg-type');
    if (typeSelect) {
      typeSelect.addEventListener('change', function() {
        var t = typeSelect.value;
        var videoFields = document.getElementById('cd-seg-video-fields');
        var slideFields = document.getElementById('cd-seg-slide-fields');
        var textFields = document.getElementById('cd-seg-slide-text-fields');
        var imageFields = document.getElementById('cd-seg-slide-image-fields');

        videoFields.style.display = t === 'video' ? 'grid' : 'none';
        slideFields.style.display = t !== 'video' ? 'block' : 'none';
        textFields.style.display = (t === 'slide_text' || t === 'slide_mixed') ? 'block' : 'none';
        imageFields.style.display = (t === 'slide_image' || t === 'slide_mixed') ? 'block' : 'none';
      });
    }

    // Live preview as user types
    var startInput = document.getElementById('cd-seg-start');
    var endInput = document.getElementById('cd-seg-end');
    if (startInput) startInput.addEventListener('input', updatePreview);
    if (endInput) endInput.addEventListener('input', updatePreview);

    // Category toggle
    var catToggle = document.getElementById('cd-cat-toggle');
    if (catToggle) {
      catToggle.addEventListener('click', function() {
        var f = document.getElementById('cd-cat-form');
        f.style.display = f.style.display === 'none' ? 'flex' : 'none';
      });
    }

    // Category save
    var catSave = document.getElementById('cd-cat-save');
    if (catSave) catSave.addEventListener('click', handleSaveCategory);

    // Category delete
    var catList = document.getElementById('cd-cat-list');
    if (catList) {
      catList.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-cat-delete]');
        if (!btn) return;
        handleDeleteCategory(btn.dataset.catDelete);
      });
    }

    // Segment list actions
    if (segmentListEl) {
      segmentListEl.addEventListener('click', function(e) {
        var btn = e.target.closest('button[data-action]');
        if (!btn) return;
        var action = btn.dataset.action;
        var id = btn.dataset.id;
        var index = parseInt(btn.dataset.index, 10);
        switch (action) {
          case 'edit': loadSegmentForEdit(id); break;
          case 'delete': handleDeleteSegment(id); break;
          case 'moveUp': handleMoveSegment(index, -1); break;
          case 'moveDown': handleMoveSegment(index, 1); break;
          case 'preview': CD.Player.jumpToSegment(index); setTimeout(function() { CD.Player.play(); }, 300); break;
        }
      });
    }
  }

  function updatePreview() {
    var startMs = CD.Utils.parseTime(document.getElementById('cd-seg-start').value);
    var endMs = CD.Utils.parseTime(document.getElementById('cd-seg-end').value);
    if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
      CD.TimelineUI.showPreview(startMs, endMs);
    } else {
      CD.TimelineUI.removePreview();
    }
  }

  // ============================================================
  // HANDLERS
  // ============================================================
  function handleUnlock() {
    var pinInput = document.getElementById('cd-pin-input');
    var errorEl = document.getElementById('cd-pin-error');
    var pin = (pinInput.value || '').trim();
    if (!pin) { showError(errorEl, 'Ingresa el PIN'); return; }
    var projectId = CD.State.get('project').id;
    var submitBtn = document.getElementById('cd-pin-submit');
    submitBtn.disabled = true;
    CD.API.unlock(projectId, pin)
      .then(function(data) {
        CD.State.set({ editToken: data.token, isEditing: true });
        CD.State.saveSession(data.token);
      })
      .catch(function(err) { showError(errorEl, err.message); })
      .finally(function() { submitBtn.disabled = false; });
  }

  function handleLock() {
    var projectId = CD.State.get('project').id;
    CD.API.lock(projectId).catch(function() {});
    CD.State.set({ editToken: null, isEditing: false, editingSegmentId: null });
    CD.State.saveSession(null);
  }

  function handleSaveSegment() {
    var segType = document.getElementById('cd-seg-type').value;
    var title = (document.getElementById('cd-seg-title').value || '').trim();
    var categoryId = document.getElementById('cd-seg-category').value || '';
    var colorInput = document.getElementById('cd-seg-color').value;
    var color = categoryId ? '' : colorInput;
    var transIn = document.getElementById('cd-seg-trans-in').value;
    var transOut = document.getElementById('cd-seg-trans-out').value;
    var fadeInSec = parseFloat(document.getElementById('cd-seg-fade-in').value) || 0.8;
    var fadeOutSec = parseFloat(document.getElementById('cd-seg-fade-out').value) || 0.8;
    var fadeInMs = Math.round(Math.max(0.3, Math.min(3, fadeInSec)) * 1000);
    var fadeOutMs = Math.round(Math.max(0.3, Math.min(3, fadeOutSec)) * 1000);
    var errorEl = document.getElementById('cd-seg-error');

    var projectId = CD.State.get('project').id;
    var saveBtn = document.getElementById('cd-seg-save');

    var data = {
      type: segType,
      title: title,
      category_id: categoryId,
      color: color,
      transition_in: transIn,
      transition_out: transOut,
      fade_in_ms: fadeInMs,
      fade_out_ms: fadeOutMs
    };

    if (segType === 'video') {
      var startMs = CD.Utils.parseTime(document.getElementById('cd-seg-start').value);
      var endMs = CD.Utils.parseTime(document.getElementById('cd-seg-end').value);
      if (isNaN(startMs)) { showError(errorEl, 'Tiempo de inicio invalido.'); return; }
      if (isNaN(endMs)) { showError(errorEl, 'Tiempo de fin invalido.'); return; }
      if (endMs <= startMs) { showError(errorEl, 'El fin debe ser mayor que el inicio.'); return; }
      if ((endMs - startMs) < CD.Config.MIN_SEGMENT_DURATION_MS) { showError(errorEl, 'Segmento muy corto.'); return; }
      data.source_start_ms = startMs;
      data.source_end_ms = endMs;
    } else {
      var durationSec = parseFloat(document.getElementById('cd-seg-duration').value);
      if (isNaN(durationSec) || durationSec < 1) { showError(errorEl, 'Duracion minima: 1 segundo.'); return; }
      if (durationSec > 30) { showError(errorEl, 'Duracion maxima: 30 segundos.'); return; }
      data.duration_ms = Math.round(durationSec * 1000);
      data.source_start_ms = 0;
      data.source_end_ms = 0;

      // Build payload
      var payload = {};
      var bgColor = document.getElementById('cd-seg-bg-color');
      var textColor = document.getElementById('cd-seg-text-color');
      if (bgColor) payload.bg_color = bgColor.value;
      if (textColor) payload.text_color = textColor.value;

      if (segType === 'slide_text' || segType === 'slide_mixed') {
        var subtitle = document.getElementById('cd-seg-subtitle');
        var body = document.getElementById('cd-seg-body');
        if (subtitle) payload.subtitle = subtitle.value;
        if (body) payload.body = body.value;
        payload.title = title;
      }
      if (segType === 'slide_image' || segType === 'slide_mixed') {
        var imgUrl = document.getElementById('cd-seg-image-url');
        var caption = document.getElementById('cd-seg-caption');
        if (imgUrl) payload.image_url = imgUrl.value;
        if (caption) payload.caption = caption.value;
      }
      data.payload_json = JSON.stringify(payload);
    }

    if (editingSegmentId) data.id = editingSegmentId;

    saveBtn.disabled = true;
    CD.API.saveSegment(projectId, data)
      .then(function() { resetForm(); CD.TimelineUI.removePreview(); return reloadSegments(); })
      .catch(function(err) { showError(errorEl, err.message); })
      .finally(function() { saveBtn.disabled = false; });
  }

  function handleDeleteSegment(segmentId) {
    if (!confirm('Eliminar este segmento?')) return;
    CD.API.deleteSegment(segmentId).then(reloadSegments).catch(function(err) { alert('Error: ' + err.message); });
  }

  function handleMoveSegment(index, direction) {
    var segments = CD.State.get('segments');
    var newIndex = index + direction;
    if (newIndex < 0 || newIndex >= segments.length) return;
    var ids = segments.map(function(s) { return s.id; });
    var temp = ids[index]; ids[index] = ids[newIndex]; ids[newIndex] = temp;
    CD.API.reorderSegments(CD.State.get('project').id, ids).then(reloadSegments).catch(function(err) { alert('Error: ' + err.message); });
  }

  function handleSaveCategory() {
    var name = (document.getElementById('cd-cat-name').value || '').trim();
    var color = document.getElementById('cd-cat-color').value;
    if (!name) return;
    CD.API.saveCategory(CD.State.get('project').id, { name: name, color: color })
      .then(function() { return reloadCategories(); })
      .catch(function(err) { alert('Error: ' + err.message); });
  }

  function handleDeleteCategory(categoryId) {
    if (!confirm('Eliminar esta categoria?')) return;
    CD.API.deleteCategory(categoryId)
      .then(function() { return reloadCategories(); })
      .catch(function(err) { alert('Error: ' + err.message); });
  }

  function loadSegmentForEdit(segmentId) {
    var segments = CD.State.get('segments');
    var seg = segments.find(function(s) { return s.id === segmentId; });
    if (!seg) return;

    editingSegmentId = segmentId;
    CD.State.set({ editingSegmentId: segmentId });

    var segType = String(seg.type || 'video');

    // Set type and trigger fields toggle
    var typeSelect = document.getElementById('cd-seg-type');
    if (typeSelect) {
      typeSelect.value = segType;
      typeSelect.dispatchEvent(new Event('change'));
    }

    document.getElementById('cd-seg-title').value = seg.title || '';

    if (segType === 'video') {
      document.getElementById('cd-seg-start').value = CD.Utils.formatTimePrecise(Number(seg.source_start_ms));
      document.getElementById('cd-seg-end').value = CD.Utils.formatTimePrecise(Number(seg.source_end_ms));
    } else {
      var durEl = document.getElementById('cd-seg-duration');
      if (durEl) durEl.value = (Number(seg.duration_ms) || 5000) / 1000;

      var payload = {};
      try { payload = JSON.parse(seg.payload_json || '{}'); } catch(e) {}

      var bgEl = document.getElementById('cd-seg-bg-color');
      var txEl = document.getElementById('cd-seg-text-color');
      if (bgEl && payload.bg_color) bgEl.value = payload.bg_color;
      if (txEl && payload.text_color) txEl.value = payload.text_color;

      if (segType === 'slide_text' || segType === 'slide_mixed') {
        var subEl = document.getElementById('cd-seg-subtitle');
        var bodyEl = document.getElementById('cd-seg-body');
        if (subEl) subEl.value = payload.subtitle || '';
        if (bodyEl) bodyEl.value = payload.body || '';
      }
      if (segType === 'slide_image' || segType === 'slide_mixed') {
        var imgEl = document.getElementById('cd-seg-image-url');
        var capEl = document.getElementById('cd-seg-caption');
        if (imgEl) imgEl.value = payload.image_url || '';
        if (capEl) capEl.value = payload.caption || '';
      }
    }

    // Transitions
    var transInEl = document.getElementById('cd-seg-trans-in');
    var transOutEl = document.getElementById('cd-seg-trans-out');
    var fadeInEl = document.getElementById('cd-seg-fade-in');
    var fadeOutEl = document.getElementById('cd-seg-fade-out');
    if (transInEl) transInEl.value = seg.transition_in || 'direct_cut';
    if (transOutEl) transOutEl.value = seg.transition_out || 'direct_cut';
    if (fadeInEl) fadeInEl.value = ((Number(seg.fade_in_ms) || 800) / 1000).toFixed(1);
    if (fadeOutEl) fadeOutEl.value = ((Number(seg.fade_out_ms) || 800) / 1000).toFixed(1);

    var catSelect = document.getElementById('cd-seg-category');
    if (catSelect) catSelect.value = seg.category_id || '';

    var colorInput = document.getElementById('cd-seg-color');
    if (colorInput && seg.color) colorInput.value = seg.color;

    document.getElementById('cd-seg-form-title').textContent = 'Editando segmento';
    document.getElementById('cd-seg-save').textContent = 'Guardar cambios';
    document.getElementById('cd-seg-cancel').style.display = 'inline-block';

    updatePreview();
    renderSegmentList();
  }

  function resetForm() {
    editingSegmentId = null;
    CD.State.set({ editingSegmentId: null });

    var el = function(id) { return document.getElementById(id); };
    if (el('cd-seg-title')) el('cd-seg-title').value = '';
    if (el('cd-seg-start')) el('cd-seg-start').value = CD.Utils.formatTimePrecise(CD.State.get('currentSourceMs'));
    if (el('cd-seg-end')) el('cd-seg-end').value = '';
    if (el('cd-seg-error')) el('cd-seg-error').style.display = 'none';
    if (el('cd-seg-category')) el('cd-seg-category').value = '';
    if (el('cd-seg-form-title')) el('cd-seg-form-title').textContent = 'Nuevo segmento';
    if (el('cd-seg-save')) el('cd-seg-save').textContent = 'Agregar segmento';
    if (el('cd-seg-cancel')) el('cd-seg-cancel').style.display = 'none';

    CD.TimelineUI.removePreview();
    renderSegmentList();
  }

  function reloadSegments() {
    return CD.API.getSegments(CD.State.get('project').id).then(function(data) {
      CD.State.set({ segments: CD.Utils.buildEditedTimeline(data.segments) });
    });
  }

  function reloadCategories() {
    return CD.API.getCategories(CD.State.get('project').id).then(function(data) {
      CD.State.set({ categories: data.categories });
    });
  }

  function showError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(function() { el.style.display = 'none'; }, 5000);
  }

  return { init: init };

})();
