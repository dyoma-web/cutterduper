/**
 * CutterDuper — Panel de Edición
 * ================================
 * CRUD de segmentos, unlock/lock, reordenamiento.
 * Solo visible en modo editor (después de ingresar PIN).
 */
var CD = window.CD || {};

CD.Editor = (function() {

  var container = null;
  var segmentListEl = null;
  var formEl = null;
  var editingSegmentId = null; // null = creando nuevo, string = editando existente

  /**
   * Inicializa el panel de edición.
   */
  function init(containerId) {
    container = document.getElementById(containerId);
    if (!container) return;

    render();

    CD.State.on('isEditing', function(isEditing) {
      render();
    });

    CD.State.on('segments', function() {
      if (CD.State.get('isEditing')) {
        renderSegmentList();
      }
    });
  }

  function render() {
    if (!container) return;
    container.innerHTML = '';

    var isEditing = CD.State.get('isEditing');

    if (!isEditing) {
      renderLockScreen();
    } else {
      renderEditorPanel();
    }
  }

  /**
   * Pantalla de desbloqueo (PIN).
   */
  function renderLockScreen() {
    var wrapper = document.createElement('div');
    wrapper.className = 'cd-editor__lock';

    wrapper.innerHTML =
      '<h3>Modo Editor</h3>' +
      '<p>Ingresa el PIN para editar segmentos.</p>' +
      '<div class="cd-editor__pin-form">' +
        '<input type="password" id="cd-pin-input" class="cd-input" placeholder="PIN de edición" maxlength="20">' +
        '<button id="cd-pin-submit" class="cd-btn cd-btn--primary">Desbloquear</button>' +
      '</div>' +
      '<div id="cd-pin-error" class="cd-error" style="display:none"></div>';

    container.appendChild(wrapper);

    // Eventos
    var pinInput = document.getElementById('cd-pin-input');
    var pinSubmit = document.getElementById('cd-pin-submit');

    pinSubmit.addEventListener('click', handleUnlock);
    pinInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') handleUnlock();
    });
  }

  /**
   * Panel completo de edición.
   */
  function renderEditorPanel() {
    container.innerHTML = '';

    // Header con botón de bloqueo
    var header = document.createElement('div');
    header.className = 'cd-editor__header';
    header.innerHTML =
      '<h3>Editor de Segmentos</h3>' +
      '<button id="cd-lock-btn" class="cd-btn cd-btn--sm cd-btn--secondary">Cerrar sesión</button>';
    container.appendChild(header);

    // Formulario de segmento
    formEl = document.createElement('div');
    formEl.className = 'cd-editor__form';
    formEl.innerHTML =
      '<h4 id="cd-seg-form-title">Nuevo segmento</h4>' +
      '<div class="cd-form-grid">' +
        '<label>Título (opcional)<input type="text" id="cd-seg-title" class="cd-input" placeholder="Ej: Introducción" maxlength="200"></label>' +
        '<label>Inicio (fuente)<input type="text" id="cd-seg-start" class="cd-input" placeholder="MM:SS o segundos"></label>' +
        '<label>Fin (fuente)<input type="text" id="cd-seg-end" class="cd-input" placeholder="MM:SS o segundos"></label>' +
      '</div>' +
      '<div class="cd-editor__form-actions">' +
        '<button id="cd-seg-save" class="cd-btn cd-btn--primary">Agregar segmento</button>' +
        '<button id="cd-seg-cancel" class="cd-btn cd-btn--secondary" style="display:none">Cancelar</button>' +
        '<button id="cd-seg-use-current" class="cd-btn cd-btn--sm cd-btn--secondary" title="Usar el tiempo actual del video como inicio">Usar tiempo actual como inicio</button>' +
      '</div>' +
      '<div id="cd-seg-error" class="cd-error" style="display:none"></div>';
    container.appendChild(formEl);

    // Lista de segmentos
    var listWrapper = document.createElement('div');
    listWrapper.className = 'cd-editor__segments';
    listWrapper.innerHTML = '<h4>Segmentos definidos</h4>';

    segmentListEl = document.createElement('div');
    segmentListEl.className = 'cd-editor__segment-list';
    listWrapper.appendChild(segmentListEl);
    container.appendChild(listWrapper);

    // Bind eventos
    bindEditorEvents();

    // Render lista
    renderSegmentList();
  }

  /**
   * Renderiza la lista de segmentos existentes.
   */
  function renderSegmentList() {
    if (!segmentListEl) return;

    var segments = CD.State.get('segments');

    if (!segments || segments.length === 0) {
      segmentListEl.innerHTML = '<div class="cd-editor__empty">No hay segmentos. Agrega el primero arriba.</div>';
      return;
    }

    segmentListEl.innerHTML = '';

    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var item = document.createElement('div');
      item.className = 'cd-editor__segment-item';
      item.dataset.id = seg.id;
      item.dataset.index = i;

      var info = document.createElement('div');
      info.className = 'cd-editor__segment-info';
      info.innerHTML =
        '<strong>' + (seg.title || 'Segmento ' + (i + 1)) + '</strong>' +
        '<span class="cd-editor__segment-times">' +
          CD.Utils.formatTime(Number(seg.source_start_ms)) + ' → ' +
          CD.Utils.formatTime(Number(seg.source_end_ms)) +
          ' (fuente) | Editado: ' +
          CD.Utils.formatTime(Number(seg.edited_start_ms)) + ' → ' +
          CD.Utils.formatTime(Number(seg.edited_end_ms)) +
        '</span>';

      var actions = document.createElement('div');
      actions.className = 'cd-editor__segment-actions';

      // Botones de reordenar
      if (i > 0) {
        var upBtn = document.createElement('button');
        upBtn.className = 'cd-btn cd-btn--xs cd-btn--secondary';
        upBtn.textContent = '▲';
        upBtn.title = 'Mover arriba';
        upBtn.dataset.action = 'moveUp';
        upBtn.dataset.index = i;
        actions.appendChild(upBtn);
      }

      if (i < segments.length - 1) {
        var downBtn = document.createElement('button');
        downBtn.className = 'cd-btn cd-btn--xs cd-btn--secondary';
        downBtn.textContent = '▼';
        downBtn.title = 'Mover abajo';
        downBtn.dataset.action = 'moveDown';
        downBtn.dataset.index = i;
        actions.appendChild(downBtn);
      }

      var editBtn = document.createElement('button');
      editBtn.className = 'cd-btn cd-btn--xs cd-btn--secondary';
      editBtn.textContent = '✎';
      editBtn.title = 'Editar';
      editBtn.dataset.action = 'edit';
      editBtn.dataset.id = seg.id;
      actions.appendChild(editBtn);

      var delBtn = document.createElement('button');
      delBtn.className = 'cd-btn cd-btn--xs cd-btn--danger';
      delBtn.textContent = '×';
      delBtn.title = 'Eliminar';
      delBtn.dataset.action = 'delete';
      delBtn.dataset.id = seg.id;
      actions.appendChild(delBtn);

      // Botón preview: salta a este segmento
      var previewBtn = document.createElement('button');
      previewBtn.className = 'cd-btn cd-btn--xs cd-btn--secondary';
      previewBtn.textContent = '▶';
      previewBtn.title = 'Preview este segmento';
      previewBtn.dataset.action = 'preview';
      previewBtn.dataset.index = i;
      actions.appendChild(previewBtn);

      item.appendChild(info);
      item.appendChild(actions);
      segmentListEl.appendChild(item);
    }
  }

  /**
   * Bind eventos del panel editor.
   */
  function bindEditorEvents() {
    // Cerrar sesión
    var lockBtn = document.getElementById('cd-lock-btn');
    if (lockBtn) {
      lockBtn.addEventListener('click', handleLock);
    }

    // Guardar segmento
    var saveBtn = document.getElementById('cd-seg-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', handleSaveSegment);
    }

    // Cancelar edición
    var cancelBtn = document.getElementById('cd-seg-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', resetForm);
    }

    // Usar tiempo actual
    var useCurrentBtn = document.getElementById('cd-seg-use-current');
    if (useCurrentBtn) {
      useCurrentBtn.addEventListener('click', function() {
        var sourceMs = CD.State.get('currentSourceMs');
        var startInput = document.getElementById('cd-seg-start');
        if (startInput) {
          startInput.value = CD.Utils.formatTimePrecise(sourceMs);
        }
      });
    }

    // Acciones en la lista de segmentos (delegación)
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
          case 'preview':
            CD.Player.jumpToSegment(index);
            setTimeout(function() { CD.Player.play(); }, 300);
            break;
        }
      });
    }
  }

  // ============================================================
  // Handlers
  // ============================================================

  function handleUnlock() {
    var pinInput = document.getElementById('cd-pin-input');
    var errorEl = document.getElementById('cd-pin-error');
    var pin = (pinInput.value || '').trim();

    if (!pin) {
      showError(errorEl, 'Ingresa el PIN');
      return;
    }

    var projectId = CD.State.get('project').id;
    var submitBtn = document.getElementById('cd-pin-submit');
    submitBtn.disabled = true;

    CD.API.unlock(projectId, pin)
      .then(function(data) {
        CD.State.set({ editToken: data.token, isEditing: true });
        CD.State.saveSession(data.token);
      })
      .catch(function(err) {
        showError(errorEl, err.message);
      })
      .finally(function() {
        submitBtn.disabled = false;
      });
  }

  function handleLock() {
    var projectId = CD.State.get('project').id;

    CD.API.lock(projectId).catch(function() { /* ignore */ });

    CD.State.set({ editToken: null, isEditing: false });
    CD.State.saveSession(null);
  }

  function handleSaveSegment() {
    var titleInput = document.getElementById('cd-seg-title');
    var startInput = document.getElementById('cd-seg-start');
    var endInput = document.getElementById('cd-seg-end');
    var errorEl = document.getElementById('cd-seg-error');

    var title = (titleInput.value || '').trim();
    var startMs = CD.Utils.parseTime(startInput.value);
    var endMs = CD.Utils.parseTime(endInput.value);

    if (isNaN(startMs)) {
      showError(errorEl, 'Tiempo de inicio inválido. Usa formato MM:SS o segundos.');
      return;
    }
    if (isNaN(endMs)) {
      showError(errorEl, 'Tiempo de fin inválido. Usa formato MM:SS o segundos.');
      return;
    }
    if (endMs <= startMs) {
      showError(errorEl, 'El fin debe ser mayor que el inicio.');
      return;
    }
    if ((endMs - startMs) < CD.Config.MIN_SEGMENT_DURATION_MS) {
      showError(errorEl, 'El segmento es muy corto (mínimo ' + (CD.Config.MIN_SEGMENT_DURATION_MS / 1000) + 's).');
      return;
    }

    var projectId = CD.State.get('project').id;
    var saveBtn = document.getElementById('cd-seg-save');
    saveBtn.disabled = true;

    var segmentData = {
      title: title,
      source_start_ms: startMs,
      source_end_ms: endMs
    };

    if (editingSegmentId) {
      segmentData.id = editingSegmentId;
    }

    CD.API.saveSegment(projectId, segmentData)
      .then(function() {
        resetForm();
        return reloadSegments();
      })
      .catch(function(err) {
        showError(errorEl, err.message);
      })
      .finally(function() {
        saveBtn.disabled = false;
      });
  }

  function handleDeleteSegment(segmentId) {
    if (!confirm('¿Eliminar este segmento?')) return;

    CD.API.deleteSegment(segmentId)
      .then(function() {
        return reloadSegments();
      })
      .catch(function(err) {
        alert('Error al eliminar: ' + err.message);
      });
  }

  function handleMoveSegment(index, direction) {
    var segments = CD.State.get('segments');
    var newIndex = index + direction;
    if (newIndex < 0 || newIndex >= segments.length) return;

    // Swap en el arreglo de IDs
    var ids = segments.map(function(s) { return s.id; });
    var temp = ids[index];
    ids[index] = ids[newIndex];
    ids[newIndex] = temp;

    var projectId = CD.State.get('project').id;

    CD.API.reorderSegments(projectId, ids)
      .then(function() {
        return reloadSegments();
      })
      .catch(function(err) {
        alert('Error al reordenar: ' + err.message);
      });
  }

  function loadSegmentForEdit(segmentId) {
    var segments = CD.State.get('segments');
    var seg = segments.find(function(s) { return s.id === segmentId; });
    if (!seg) return;

    editingSegmentId = segmentId;

    document.getElementById('cd-seg-title').value = seg.title || '';
    document.getElementById('cd-seg-start').value = CD.Utils.formatTimePrecise(Number(seg.source_start_ms));
    document.getElementById('cd-seg-end').value = CD.Utils.formatTimePrecise(Number(seg.source_end_ms));

    document.getElementById('cd-seg-form-title').textContent = 'Editando segmento';
    document.getElementById('cd-seg-save').textContent = 'Guardar cambios';
    document.getElementById('cd-seg-cancel').style.display = 'inline-block';
  }

  function resetForm() {
    editingSegmentId = null;

    var titleInput = document.getElementById('cd-seg-title');
    var startInput = document.getElementById('cd-seg-start');
    var endInput = document.getElementById('cd-seg-end');
    var errorEl = document.getElementById('cd-seg-error');

    if (titleInput) titleInput.value = '';
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
    if (errorEl) errorEl.style.display = 'none';

    var formTitle = document.getElementById('cd-seg-form-title');
    var saveBtn = document.getElementById('cd-seg-save');
    var cancelBtn = document.getElementById('cd-seg-cancel');

    if (formTitle) formTitle.textContent = 'Nuevo segmento';
    if (saveBtn) saveBtn.textContent = 'Agregar segmento';
    if (cancelBtn) cancelBtn.style.display = 'none';
  }

  function reloadSegments() {
    var projectId = CD.State.get('project').id;
    return CD.API.getSegments(projectId)
      .then(function(data) {
        var segments = CD.Utils.buildEditedTimeline(data.segments);
        CD.State.set({ segments: segments });
      });
  }

  function showError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(function() {
      el.style.display = 'none';
    }, 5000);
  }

  // API pública
  return {
    init: init
  };

})();
