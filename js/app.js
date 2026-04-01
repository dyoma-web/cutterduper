/**
 * CutterDuper — Inicialización principal
 * ========================================
 * Carga el proyecto, inicializa componentes, conecta todo.
 */
var CD = window.CD || {};

CD.App = (function() {

  /**
   * Punto de entrada principal.
   */
  function init() {
    console.log('CutterDuper inicializando...');

    // Verificar configuración
    if (!CD.Config.APPS_SCRIPT_URL) {
      showFatalError('Falta configurar APPS_SCRIPT_URL en js/config.js');
      return;
    }

    // Obtener projectId desde URL o localStorage
    var projectId = getProjectIdFromURL();

    if (!projectId) {
      showProjectSelector();
      return;
    }

    // Guardar projectId
    try {
      localStorage.setItem(CD.Config.STORAGE_PROJECT_KEY, projectId);
    } catch(e) {}

    // Cargar sesión guardada
    CD.State.loadSession();

    // Cargar datos del proyecto
    loadProject(projectId);
  }

  /**
   * Obtiene el projectId desde URL params (?project=xxx).
   */
  function getProjectIdFromURL() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('project');
    if (id) return id;

    // Si la URL tiene "?" (el usuario llegó al inicio intencionalmente), no usar localStorage
    if (window.location.search === '' || window.location.search === '?') {
      // Limpiar proyecto guardado
      try { localStorage.removeItem(CD.Config.STORAGE_PROJECT_KEY); } catch(e) {}
      return null;
    }

    // Fallback a localStorage
    try {
      return localStorage.getItem(CD.Config.STORAGE_PROJECT_KEY);
    } catch(e) {
      return null;
    }
  }

  /**
   * Carga el proyecto y todos sus datos.
   */
  function loadProject(projectId) {
    CD.State.set({ isLoading: true, error: null });

    showLoading('Cargando proyecto...');

    // Cargar proyecto, segmentos y comentarios en paralelo
    Promise.all([
      CD.API.getProject(projectId),
      CD.API.getSegments(projectId),
      CD.API.getComments(projectId),
      CD.API.getCategories(projectId)
    ])
    .then(function(results) {
      var project = results[0].project;
      var rawSegments = results[1].segments;
      var comments = results[2].comments;
      var categories = results[3].categories;

      var segments = CD.Utils.buildEditedTimeline(rawSegments);

      CD.State.set({
        project: project,
        segments: segments,
        comments: comments,
        categories: categories,
        isLoading: false,
        currentSegmentIndex: segments.length > 0 ? 0 : -1
      });

      // Inicializar UI
      initUI(project);
    })
    .catch(function(err) {
      CD.State.set({ isLoading: false, error: err.message });
      showFatalError('Error al cargar proyecto: ' + err.message);
    });
  }

  /**
   * Inicializa todos los componentes de UI.
   */
  function initUI(project) {
    // Actualizar header
    var titleEl = document.getElementById('cd-project-title');
    if (titleEl) titleEl.textContent = project.title;

    var descEl = document.getElementById('cd-project-desc');
    if (descEl) descEl.textContent = project.description || '';

    // Disclaimer
    var disclaimerEl = document.getElementById('cd-disclaimer');
    if (disclaimerEl) {
      disclaimerEl.textContent = 'Previsualizacion de edicion — no es un render final.';
    }

    // Ocultar logo-link para visualizadores (solo editores pueden ir al inicio)
    var homeLink = document.querySelector('.cd-header__home');
    if (homeLink) {
      if (!CD.State.get('editToken')) {
        // Visualizador: deshabilitar link
        homeLink.removeAttribute('href');
        homeLink.style.cursor = 'default';
        homeLink.addEventListener('click', function(e) {
          if (!CD.State.get('editToken')) e.preventDefault();
        });
      }
      // Actualizar si cambia la sesion
      CD.State.on('editToken', function(token) {
        if (token) {
          homeLink.setAttribute('href', '?');
          homeLink.style.cursor = 'pointer';
        } else {
          homeLink.removeAttribute('href');
          homeLink.style.cursor = 'default';
        }
      });
    }

    // Ocultar loading, mostrar app
    document.getElementById('cd-loading').style.display = 'none';
    document.getElementById('cd-app').style.display = 'grid';

    // Mostrar loading en el player
    var playerWrapper = document.querySelector('.cd-player-wrapper');
    if (playerWrapper) {
      var playerLoading = document.createElement('div');
      playerLoading.className = 'cd-player-loading';
      playerLoading.id = 'cd-player-loading';
      playerLoading.innerHTML = '<div class="cd-loading-spinner"></div><span>Cargando video...</span>';
      playerWrapper.appendChild(playerLoading);
    }

    // Inicializar YouTube Player
    initYouTubePlayer(project.youtube_video_id);

    // Inicializar componentes
    CD.TimelineUI.init('cd-timeline-container');
    CD.SegmentInfo.init('cd-seginfo-container');
    CD.Comments.init('cd-comments-container');
    CD.Editor.init('cd-editor-container');

    // Preview mode button
    initPreviewButton();

    // Keyboard shortcuts
    bindKeyboardShortcuts();
  }

  /**
   * Boton de vista previa: alterna entre modo editor y modo visualizador.
   */
  function initPreviewButton() {
    var btn = document.getElementById('cd-preview-btn');
    if (!btn) return;

    // Mostrar boton si hay sesion activa
    function updateBtn() {
      var isEditing = CD.State.get('isEditing');
      var hasToken = !!CD.State.get('editToken');
      if (isEditing) {
        btn.style.display = 'flex';
        btn.innerHTML = '<span class="cd-preview-icon">&#128065;</span> Vista previa';
        btn.title = 'Ver como lo veria un visualizador';
      } else if (hasToken) {
        btn.style.display = 'flex';
        btn.innerHTML = '<span class="cd-preview-icon">&#9998;</span> Volver a editar';
        btn.title = 'Volver al modo editor';
      } else {
        btn.style.display = 'none';
      }
    }

    btn.addEventListener('click', function() {
      var isEditing = CD.State.get('isEditing');
      if (isEditing) {
        // Entrar en modo vista previa (mantener token pero ocultar editor)
        CD.State.set({ isEditing: false });
      } else {
        // Volver a editar (ya tenemos el token guardado)
        var token = CD.State.get('editToken');
        if (token) {
          CD.State.set({ isEditing: true });
        }
      }
    });

    CD.State.on('isEditing', updateBtn);
    CD.State.on('editToken', updateBtn);
    updateBtn();
  }

  /**
   * Inicializa el player de YouTube.
   */
  function initYouTubePlayer(videoId) {
    // La API de YouTube ya debe estar cargada (script en HTML)
    if (window.YT && window.YT.Player) {
      createPlayer(videoId);
    } else {
      // Esperar a que cargue
      window.onYouTubeIframeAPIReady = function() {
        createPlayer(videoId);
      };
    }
  }

  function createPlayer(videoId) {
    CD.Player.init('cd-player', videoId)
      .then(function() {
        console.log('YouTube Player listo');

        // Ocultar loading del player
        var pl = document.getElementById('cd-player-loading');
        if (pl) {
          pl.style.opacity = '0';
          setTimeout(function() { pl.remove(); }, 300);
        }

        // Si hay segmentos, posicionar en el primero
        var segments = CD.State.get('segments');
        if (segments.length > 0) {
          CD.Player.jumpToSegment(0);
        }
      })
      .catch(function(err) {
        console.error('Error inicializando player:', err);
        CD.State.set({ error: 'Error al cargar el reproductor: ' + err.message });
      });
  }

  /**
   * Atajos de teclado.
   */
  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
      // No interceptar si estamos en un input/textarea
      var tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          CD.Player.togglePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          var currentMs = CD.State.get('currentEditedMs');
          CD.Player.seekToEditedTime(Math.max(0, currentMs - 5000));
          break;
        case 'ArrowRight':
          e.preventDefault();
          var currentMs2 = CD.State.get('currentEditedMs');
          CD.Player.seekToEditedTime(currentMs2 + 5000);
          break;
      }
    });
  }

  /**
   * Muestra pantalla de selección/creación de proyecto.
   */
  function showProjectSelector() {
    var loading = document.getElementById('cd-loading');
    loading.innerHTML =
      '<div class="cd-project-selector">' +
        '<h2>CutterDuper</h2>' +
        '<p>Simulador de edición audiovisual</p>' +
        '<div class="cd-project-selector__options">' +
          '<div class="cd-project-selector__create">' +
            '<h3>Crear nuevo proyecto</h3>' +
            '<label>Título del proyecto<input type="text" id="cd-new-title" class="cd-input" placeholder="Mi proyecto" maxlength="200"></label>' +
            '<label>URL o ID del video de YouTube<input type="text" id="cd-new-video" class="cd-input" placeholder="Pega la URL completa o solo el ID"></label>' +
            '<label>PIN de edición<input type="password" id="cd-new-pin" class="cd-input" placeholder="Mínimo 4 caracteres" maxlength="20"></label>' +
            '<label>Descripción (opcional)<textarea id="cd-new-desc" class="cd-input" rows="2" maxlength="500" placeholder="Descripción breve del proyecto"></textarea></label>' +
            '<button id="cd-create-project" class="cd-btn cd-btn--primary">Crear proyecto</button>' +
            '<div id="cd-create-error" class="cd-error" style="display:none"></div>' +
          '</div>' +
          '<div class="cd-project-selector__existing" id="cd-project-list-wrapper">' +
            '<h3>Proyectos existentes</h3>' +
            '<div id="cd-project-list">Cargando...</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Cargar proyectos existentes
    CD.API.getProjects()
      .then(function(data) {
        var listEl = document.getElementById('cd-project-list');
        var projects = data.projects;

        if (!projects || projects.length === 0) {
          listEl.innerHTML = '<p>No hay proyectos aún.</p>';
          return;
        }

        listEl.innerHTML = '';
        for (var i = 0; i < projects.length; i++) {
          var p = projects[i];
          var link = document.createElement('a');
          link.href = '?project=' + p.id;
          link.className = 'cd-project-selector__item';
          link.innerHTML =
            '<strong>' + escapeHtml(p.title) + '</strong>' +
            '<span>' + escapeHtml(p.youtube_video_id) + '</span>';
          listEl.appendChild(link);
        }
      })
      .catch(function(err) {
        var listEl = document.getElementById('cd-project-list');
        listEl.innerHTML = '<p class="cd-error">Error al cargar proyectos: ' + escapeHtml(err.message) + '</p>';
      });

    // Crear proyecto
    document.getElementById('cd-create-project').addEventListener('click', function() {
      var title = document.getElementById('cd-new-title').value.trim();
      var videoId = document.getElementById('cd-new-video').value.trim();
      var pin = document.getElementById('cd-new-pin').value.trim();
      var desc = document.getElementById('cd-new-desc').value.trim();
      var errorEl = document.getElementById('cd-create-error');

      if (!title) { showInlineError(errorEl, 'El título es obligatorio'); return; }
      if (!videoId) { showInlineError(errorEl, 'El ID del video es obligatorio'); return; }
      if (!pin || pin.length < 4) { showInlineError(errorEl, 'El PIN debe tener al menos 4 caracteres'); return; }

      // Extraer video ID de URL completa si hace falta
      var extractedId = extractYouTubeId(videoId);
      if (extractedId) videoId = extractedId;

      var btn = document.getElementById('cd-create-project');
      btn.disabled = true;
      btn.textContent = 'Creando...';

      CD.API.createProject(title, videoId, pin, desc)
        .then(function(data) {
          window.location.href = '?project=' + data.project.id;
        })
        .catch(function(err) {
          showInlineError(errorEl, err.message);
          btn.disabled = false;
          btn.textContent = 'Crear proyecto';
        });
    });
  }

  /**
   * Extrae el video ID de una URL de YouTube.
   */
  function extractYouTubeId(input) {
    // Ya es solo el ID (11 chars)
    if (/^[\w-]{11}$/.test(input)) return input;

    // URL completa
    var patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = input.match(patterns[i]);
      if (match) return match[1];
    }
    return null;
  }

  function showLoading(message) {
    var el = document.getElementById('cd-loading');
    if (el) {
      el.style.display = 'flex';
      el.innerHTML = '<div class="cd-loading-spinner"></div><p>' + escapeHtml(message) + '</p>';
    }
  }

  function showFatalError(message) {
    var el = document.getElementById('cd-loading');
    if (el) {
      el.style.display = 'flex';
      el.innerHTML = '<div class="cd-fatal-error"><h2>Error</h2><p>' + escapeHtml(message) + '</p><a href="?" class="cd-btn cd-btn--primary">Volver al inicio</a></div>';
    }
  }

  function showInlineError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(function() { el.style.display = 'none'; }, 5000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // API pública
  return {
    init: init
  };

})();

// ============================================================
// Auto-inicialización cuando el DOM esté listo
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  CD.App.init();
});
