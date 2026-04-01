/**
 * CutterDuper — Cliente API
 * ==========================
 * Comunicación con Google Apps Script Web App.
 */
var CD = window.CD || {};

CD.API = (function() {

  function getBaseUrl() {
    var url = CD.Config.APPS_SCRIPT_URL;
    if (!url) {
      throw new Error('APPS_SCRIPT_URL no configurada. Edita js/config.js');
    }
    return url;
  }

  /**
   * Request GET al Apps Script.
   */
  function apiGet(params) {
    var url = getBaseUrl();
    var query = [];
    for (var key in params) {
      if (params.hasOwnProperty(key)) {
        query.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
      }
    }
    if (query.length > 0) url += '?' + query.join('&');

    return fetch(url, {
      method: 'GET',
      redirect: 'follow'
    })
    .then(function(resp) { return resp.json(); })
    .then(function(data) {
      if (!data.ok) throw new Error(data.error || 'Error desconocido');
      return data;
    });
  }

  /**
   * Request POST al Apps Script.
   */
  function apiPost(body) {
    var url = getBaseUrl();

    // Agregar token de edición si existe
    var token = CD.State.get('editToken');
    if (token && !body.editToken) {
      body.editToken = token;
    }

    return fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body)
    })
    .then(function(resp) { return resp.json(); })
    .then(function(data) {
      if (!data.ok) {
        // Si es error de auth, limpiar sesión
        if (data.code === 401) {
          CD.State.set({ editToken: null, isEditing: false });
          CD.State.saveSession(null);
        }
        throw new Error(data.error || 'Error desconocido');
      }
      return data;
    });
  }

  // ============================================================
  // Endpoints específicos
  // ============================================================

  function getProject(projectId) {
    return apiGet({ action: 'getProject', projectId: projectId });
  }

  function getProjects() {
    return apiGet({ action: 'getProject' });
  }

  function createProject(title, youtubeVideoId, pin, description) {
    return apiPost({
      action: 'createProject',
      title: title,
      youtube_video_id: youtubeVideoId,
      pin: pin,
      description: description || ''
    });
  }

  function updateProject(projectId, updates) {
    var body = Object.assign({ action: 'updateProject', projectId: projectId }, updates);
    return apiPost(body);
  }

  function getSegments(projectId) {
    return apiGet({ action: 'getSegments', projectId: projectId });
  }

  function saveSegment(projectId, segmentData) {
    var body = Object.assign({
      action: 'saveSegment',
      projectId: projectId
    }, segmentData);
    return apiPost(body);
  }

  function deleteSegment(segmentId) {
    return apiPost({ action: 'deleteSegment', segmentId: segmentId });
  }

  function reorderSegments(projectId, orderedIds) {
    return apiPost({
      action: 'reorderSegments',
      projectId: projectId,
      orderedIds: orderedIds
    });
  }

  function getComments(projectId) {
    return apiGet({ action: 'getComments', projectId: projectId });
  }

  function addComment(projectId, editedTimeMs, sourceTimeMs, text, authorLabel) {
    return apiPost({
      action: 'addComment',
      projectId: projectId,
      edited_time_ms: editedTimeMs,
      source_time_ms: sourceTimeMs,
      text: text,
      author_label: authorLabel || 'Anónimo'
    });
  }

  function deleteComment(commentId) {
    return apiPost({ action: 'deleteComment', commentId: commentId });
  }

  function unlock(projectId, pin) {
    return apiPost({
      action: 'unlock',
      projectId: projectId,
      pin: pin
    });
  }

  function lock(projectId) {
    var token = CD.State.get('editToken');
    return apiPost({
      action: 'lock',
      projectId: projectId,
      editToken: token
    });
  }

  function getCategories(projectId) {
    return apiGet({ action: 'getCategories', projectId: projectId });
  }

  function saveCategory(projectId, categoryData) {
    var body = Object.assign({ action: 'saveCategory', projectId: projectId }, categoryData);
    return apiPost(body);
  }

  function deleteCategory(categoryId) {
    return apiPost({ action: 'deleteCategory', categoryId: categoryId });
  }

  function ping() {
    return apiGet({ action: 'ping' });
  }

  return {
    getProject: getProject,
    getProjects: getProjects,
    createProject: createProject,
    updateProject: updateProject,
    getSegments: getSegments,
    saveSegment: saveSegment,
    deleteSegment: deleteSegment,
    reorderSegments: reorderSegments,
    getComments: getComments,
    addComment: addComment,
    deleteComment: deleteComment,
    getCategories: getCategories,
    saveCategory: saveCategory,
    deleteCategory: deleteCategory,
    unlock: unlock,
    lock: lock,
    ping: ping
  };

})();
