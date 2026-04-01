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

    formEl.innerHTML =
      '<h4 id="cd-seg-form-title">Nuevo segmento</h4>' +
      '<div class="cd-form-grid">' +
        '<label>Titulo (opcional)<input type="text" id="cd-seg-title" class="cd-input" placeholder="Ej: Introduccion" maxlength="200"></label>' +
        '<label>Inicio (fuente)' +
          '<div style="display:flex;gap:4px;">' +
            '<input type="text" id="cd-seg-start" class="cd-input" placeholder="MM:SS" value="' + currentTime + '">' +
            '<button id="cd-seg-use-start" class="cd-btn cd-btn--xs cd-btn--secondary" title="Capturar tiempo actual">Ahora</button>' +
          '</div>' +
        '</label>' +
        '<label>Fin (fuente)' +
          '<div style="display:flex;gap:4px;">' +
            '<input type="text" id="cd-seg-end" class="cd-input" placeholder="MM:SS">' +
            '<button id="cd-seg-use-end" class="cd-btn cd-btn--xs cd-btn--secondary" title="Capturar tiempo actual">Ahora</button>' +
          '</div>' +
        '</label>' +
      '</div>' +
      '<div class="cd-form-grid cd-form-grid--2">' +
        '<label>Categoria<select id="cd-seg-category" class="cd-input">' + catOptions + '</select></label>' +
        '<label>Color (opcional)<input type="color" id="cd-seg-color" class="cd-input-color" value="#3b82f6"></label>' +
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
    if (seg.color && String(seg.color).trim()) return String(seg.color);
    if (seg.category_id && String(seg.category_id).trim()) {
      var categories = CD.State.get('categories') || [];
      var cat = categories.find(function(c) { return String(c.id) === String(seg.category_id); });
      if (cat && cat.color) return cat.color;
    }
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
    var title = (document.getElementById('cd-seg-title').value || '').trim();
    var startMs = CD.Utils.parseTime(document.getElementById('cd-seg-start').value);
    var endMs = CD.Utils.parseTime(document.getElementById('cd-seg-end').value);
    var categoryId = document.getElementById('cd-seg-category').value;
    var color = document.getElementById('cd-seg-color').value;
    var errorEl = document.getElementById('cd-seg-error');

    if (isNaN(startMs)) { showError(errorEl, 'Tiempo de inicio invalido.'); return; }
    if (isNaN(endMs)) { showError(errorEl, 'Tiempo de fin invalido.'); return; }
    if (endMs <= startMs) { showError(errorEl, 'El fin debe ser mayor que el inicio.'); return; }
    if ((endMs - startMs) < CD.Config.MIN_SEGMENT_DURATION_MS) { showError(errorEl, 'Segmento muy corto (min ' + (CD.Config.MIN_SEGMENT_DURATION_MS / 1000) + 's).'); return; }

    var projectId = CD.State.get('project').id;
    var saveBtn = document.getElementById('cd-seg-save');
    saveBtn.disabled = true;

    var data = { title: title, source_start_ms: startMs, source_end_ms: endMs, category_id: categoryId, color: color };
    if (editingSegmentId) data.id = editingSegmentId;

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

    document.getElementById('cd-seg-title').value = seg.title || '';
    document.getElementById('cd-seg-start').value = CD.Utils.formatTimePrecise(Number(seg.source_start_ms));
    document.getElementById('cd-seg-end').value = CD.Utils.formatTimePrecise(Number(seg.source_end_ms));

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
