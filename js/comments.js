/**
 * CutterDuper — Panel de Comentarios
 * ====================================
 * Lista de comentarios sincronizados con la reproducción.
 * Click en comentario = seek al tiempo editado.
 * Auto-scroll moderado al comentario activo.
 */
var CD = window.CD || {};

CD.Comments = (function() {

  var container = null;
  var listEl = null;
  var formEl = null;
  var autoScrollEnabled = true;
  var userScrollTimeout = null;

  /**
   * Inicializa el panel de comentarios.
   */
  function init(containerId) {
    container = document.getElementById(containerId);
    if (!container) return;

    render();
    bindEvents();

    CD.State.on('comments', renderComments);
    CD.State.on('currentEditedMs', updateActiveComment);
  }

  function render() {
    container.innerHTML = '';
    container.className = 'cd-comments';

    // Header
    var header = document.createElement('div');
    header.className = 'cd-comments__header';
    header.innerHTML = '<h3>Comentarios</h3>';
    container.appendChild(header);

    // Lista
    listEl = document.createElement('div');
    listEl.className = 'cd-comments__list';
    container.appendChild(listEl);

    // Formulario
    formEl = document.createElement('div');
    formEl.className = 'cd-comments__form';
    formEl.innerHTML =
      '<input type="text" id="cd-comment-author" class="cd-input cd-input--sm" placeholder="Tu nombre (opcional)" maxlength="50">' +
      '<div class="cd-comments__form-row">' +
        '<textarea id="cd-comment-text" class="cd-input" placeholder="Escribe un comentario en este punto del video..." maxlength="1000" rows="2"></textarea>' +
        '<button id="cd-comment-submit" class="cd-btn cd-btn--primary cd-btn--sm">Enviar</button>' +
      '</div>' +
      '<div class="cd-comments__form-hint">El comentario se anclará al tiempo actual: <span id="cd-comment-time">00:00</span></div>';
    container.appendChild(formEl);

    renderComments();
  }

  /**
   * Renderiza la lista de comentarios.
   */
  function renderComments() {
    if (!listEl) return;

    var comments = CD.State.get('comments');
    var isEditing = CD.State.get('isEditing');

    if (!comments || comments.length === 0) {
      listEl.innerHTML = '<div class="cd-comments__empty">No hay comentarios aún.</div>';
      return;
    }

    listEl.innerHTML = '';

    for (var i = 0; i < comments.length; i++) {
      var c = comments[i];
      var item = document.createElement('div');
      item.className = 'cd-comment';
      item.dataset.id = c.id;
      item.dataset.editedTimeMs = c.edited_time_ms;

      var timeTag = document.createElement('span');
      timeTag.className = 'cd-comment__time';
      timeTag.textContent = CD.Utils.formatTime(Number(c.edited_time_ms));

      var author = document.createElement('span');
      author.className = 'cd-comment__author';
      author.textContent = c.author_label || 'Anónimo';

      var headerDiv = document.createElement('div');
      headerDiv.className = 'cd-comment__header';
      headerDiv.appendChild(timeTag);
      headerDiv.appendChild(author);

      // Botón eliminar (solo en modo editor)
      if (isEditing) {
        var deleteBtn = document.createElement('button');
        deleteBtn.className = 'cd-btn cd-btn--danger cd-btn--xs';
        deleteBtn.textContent = '×';
        deleteBtn.title = 'Eliminar comentario';
        deleteBtn.dataset.commentId = c.id;
        headerDiv.appendChild(deleteBtn);
      }

      var textDiv = document.createElement('div');
      textDiv.className = 'cd-comment__text';
      textDiv.textContent = c.text;

      item.appendChild(headerDiv);
      item.appendChild(textDiv);
      listEl.appendChild(item);
    }
  }

  /**
   * Actualiza el comentario activo basado en la posición de reproducción.
   */
  function updateActiveComment() {
    if (!listEl) return;

    var currentMs = CD.State.get('currentEditedMs');
    var comments = CD.State.get('comments');

    if (!comments || comments.length === 0) return;

    // Encontrar el comentario más cercano al tiempo actual (sin pasar)
    var activeId = null;
    for (var i = comments.length - 1; i >= 0; i--) {
      if (Number(comments[i].edited_time_ms) <= currentMs) {
        activeId = comments[i].id;
        break;
      }
    }

    // Actualizar estado solo si cambió
    if (activeId !== CD.State.get('activeCommentId')) {
      CD.State.set({ activeCommentId: activeId });

      // Actualizar clases CSS
      var items = listEl.querySelectorAll('.cd-comment');
      for (var j = 0; j < items.length; j++) {
        if (items[j].dataset.id === activeId) {
          items[j].classList.add('cd-comment--active');

          // Auto-scroll moderado
          if (autoScrollEnabled) {
            items[j].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        } else {
          items[j].classList.remove('cd-comment--active');
        }
      }
    }

    // Actualizar el tiempo mostrado en el formulario
    var timeHint = document.getElementById('cd-comment-time');
    if (timeHint) {
      timeHint.textContent = CD.Utils.formatTime(currentMs);
    }
  }

  /**
   * Bind events.
   */
  function bindEvents() {
    if (!container) return;

    // Click en comentario → seek
    container.addEventListener('click', function(e) {
      // Click en botón eliminar
      var deleteBtn = e.target.closest('.cd-btn--danger');
      if (deleteBtn && deleteBtn.dataset.commentId) {
        handleDeleteComment(deleteBtn.dataset.commentId);
        return;
      }

      // Click en comentario → seek
      var commentEl = e.target.closest('.cd-comment');
      if (commentEl && commentEl.dataset.editedTimeMs) {
        var editedMs = parseInt(commentEl.dataset.editedTimeMs, 10);
        CD.Player.seekToEditedTime(editedMs);
      }
    });

    // Submit comentario
    var submitBtn = document.getElementById('cd-comment-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', handleAddComment);
    }

    // Enter en textarea (con Ctrl/Cmd)
    var textarea = document.getElementById('cd-comment-text');
    if (textarea) {
      textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          handleAddComment();
        }
      });
    }

    // Detectar scroll manual del usuario para pausar auto-scroll
    if (listEl) {
      listEl.addEventListener('scroll', function() {
        autoScrollEnabled = false;
        clearTimeout(userScrollTimeout);
        // Re-habilitar auto-scroll después de 5 segundos sin scroll manual
        userScrollTimeout = setTimeout(function() {
          autoScrollEnabled = true;
        }, 5000);
      });
    }
  }

  /**
   * Enviar un nuevo comentario.
   */
  function handleAddComment() {
    var textEl = document.getElementById('cd-comment-text');
    var authorEl = document.getElementById('cd-comment-author');

    var text = (textEl.value || '').trim();
    if (!text) {
      textEl.focus();
      return;
    }

    var projectId = CD.State.get('project').id;
    var editedMs = CD.State.get('currentEditedMs');
    var sourceMs = CD.State.get('currentSourceMs');
    var author = (authorEl.value || '').trim() || 'Anónimo';

    var submitBtn = document.getElementById('cd-comment-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = '...';

    CD.API.addComment(projectId, editedMs, sourceMs, text, author)
      .then(function(data) {
        textEl.value = '';
        // Recargar comentarios
        return CD.API.getComments(projectId);
      })
      .then(function(data) {
        CD.State.set({ comments: data.comments });
      })
      .catch(function(err) {
        alert('Error al guardar comentario: ' + err.message);
      })
      .finally(function() {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar';
      });
  }

  /**
   * Eliminar comentario (solo editor).
   */
  function handleDeleteComment(commentId) {
    if (!confirm('¿Eliminar este comentario?')) return;

    CD.API.deleteComment(commentId)
      .then(function() {
        var projectId = CD.State.get('project').id;
        return CD.API.getComments(projectId);
      })
      .then(function(data) {
        CD.State.set({ comments: data.comments });
      })
      .catch(function(err) {
        alert('Error al eliminar comentario: ' + err.message);
      });
  }

  // API pública
  return {
    init: init,
    renderComments: renderComments,
    updateActiveComment: updateActiveComment
  };

})();
