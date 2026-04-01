/**
 * CutterDuper — Google Apps Script Backend
 * =========================================
 * Deploy como Web App: Execute as me, Anyone can access.
 * Este archivo se copia en Google Apps Script (script.google.com).
 */

// ============================================================
// CONFIGURACIÓN
// ============================================================
const SHEET_ID = ''; // <-- Pegar aquí el ID del Google Sheet

function getSpreadsheet() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function getSheet(name) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const headers = SHEET_HEADERS[name];
    if (headers) sheet.appendRow(headers);
  }
  return sheet;
}

const SHEET_HEADERS = {
  projects: ['id', 'title', 'description', 'youtube_video_id', 'edit_pin_hash', 'status', 'created_at', 'updated_at'],
  segments: ['id', 'project_id', 'order_index', 'title', 'source_start_ms', 'source_end_ms', 'edited_start_ms', 'edited_end_ms', 'created_at', 'updated_at'],
  comments: ['id', 'project_id', 'edited_time_ms', 'source_time_ms', 'author_label', 'text', 'created_at'],
  edit_sessions: ['project_id', 'token', 'expires_at']
};

// ============================================================
// UTILIDADES
// ============================================================
function generateId() {
  return Utilities.getUuid();
}

function now() {
  return new Date().toISOString();
}

function hashPin(pin) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pin);
  return raw.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse(message, code) {
  return jsonResponse({ ok: false, error: message, code: code || 400 });
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    rows.push(obj);
  }
  return rows;
}

function findRowIndex(sheet, colName, value) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colIdx = headers.indexOf(colName);
  if (colIdx === -1) return -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIdx]) === String(value)) return i + 1; // 1-based row
  }
  return -1;
}

function deleteRow(sheet, colName, value) {
  const rowIdx = findRowIndex(sheet, colName, value);
  if (rowIdx > 0) {
    sheet.deleteRow(rowIdx);
    return true;
  }
  return false;
}

// ============================================================
// VALIDACIÓN DE SESIÓN DE EDICIÓN
// ============================================================
function isValidSession(projectId, token) {
  if (!token) return false;
  const sheet = getSheet('edit_sessions');
  const sessions = sheetToObjects(sheet);
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    if (String(s.project_id) === String(projectId) && String(s.token) === String(token)) {
      if (new Date(s.expires_at) > new Date()) return true;
      // Sesión expirada, eliminarla
      deleteRow(sheet, 'token', token);
      return false;
    }
  }
  return false;
}

function requireEditor(params) {
  const projectId = params.projectId;
  const token = params.editToken;
  if (!isValidSession(projectId, token)) {
    return false;
  }
  return true;
}

// ============================================================
// RATE LIMITING SIMPLE PARA PIN
// ============================================================
// Usa PropertiesService para contar intentos por proyecto
function checkRateLimit(projectId) {
  const props = PropertiesService.getScriptProperties();
  const key = 'pin_attempts_' + projectId;
  const lockKey = 'pin_lock_' + projectId;

  const lockUntil = props.getProperty(lockKey);
  if (lockUntil && new Date() < new Date(lockUntil)) {
    return { allowed: false, message: 'Demasiados intentos. Intente en 5 minutos.' };
  }

  const attempts = parseInt(props.getProperty(key) || '0', 10);
  if (attempts >= 5) {
    // Bloquear por 5 minutos
    const unlock = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    props.setProperty(lockKey, unlock);
    props.setProperty(key, '0');
    return { allowed: false, message: 'Demasiados intentos. Intente en 5 minutos.' };
  }

  return { allowed: true, attempts: attempts };
}

function incrementAttempts(projectId) {
  const props = PropertiesService.getScriptProperties();
  const key = 'pin_attempts_' + projectId;
  const current = parseInt(props.getProperty(key) || '0', 10);
  props.setProperty(key, String(current + 1));
}

function resetAttempts(projectId) {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('pin_attempts_' + projectId);
  props.deleteProperty('pin_lock_' + projectId);
}

// ============================================================
// HANDLERS — GET
// ============================================================
function doGet(e) {
  const action = (e.parameter && e.parameter.action) || '';
  const params = e.parameter || {};

  try {
    switch (action) {
      case 'getProject':
        return handleGetProject(params);
      case 'getSegments':
        return handleGetSegments(params);
      case 'getComments':
        return handleGetComments(params);
      case 'ping':
        return jsonResponse({ ok: true, message: 'CutterDuper API running' });
      default:
        return errorResponse('Acción GET no reconocida: ' + action);
    }
  } catch (err) {
    return errorResponse('Error interno: ' + err.message, 500);
  }
}

// ============================================================
// HANDLERS — POST
// ============================================================
function doPost(e) {
  let body = {};
  try {
    if (e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    return errorResponse('JSON inválido en el body');
  }

  const action = body.action || '';

  try {
    switch (action) {
      case 'createProject':
        return handleCreateProject(body);
      case 'updateProject':
        return handleUpdateProject(body);
      case 'unlock':
        return handleUnlock(body);
      case 'lock':
        return handleLock(body);
      case 'saveSegment':
        return handleSaveSegment(body);
      case 'deleteSegment':
        return handleDeleteSegment(body);
      case 'reorderSegments':
        return handleReorderSegments(body);
      case 'addComment':
        return handleAddComment(body);
      case 'deleteComment':
        return handleDeleteComment(body);
      default:
        return errorResponse('Acción POST no reconocida: ' + action);
    }
  } catch (err) {
    return errorResponse('Error interno: ' + err.message, 500);
  }
}

// ============================================================
// PROJECT
// ============================================================
function handleGetProject(params) {
  const sheet = getSheet('projects');
  const projects = sheetToObjects(sheet);
  const projectId = params.projectId;

  if (projectId) {
    const project = projects.find(function(p) { return String(p.id) === String(projectId); });
    if (!project) return errorResponse('Proyecto no encontrado', 404);
    // No enviar el hash del PIN al frontend
    delete project.edit_pin_hash;
    return jsonResponse({ ok: true, project: project });
  }

  // Lista de proyectos (sin hash)
  projects.forEach(function(p) { delete p.edit_pin_hash; });
  return jsonResponse({ ok: true, projects: projects });
}

function handleCreateProject(body) {
  const title = (body.title || '').trim();
  const youtubeVideoId = (body.youtube_video_id || '').trim();
  const pin = (body.pin || '').trim();

  if (!title) return errorResponse('El título es obligatorio');
  if (!youtubeVideoId) return errorResponse('El ID de video de YouTube es obligatorio');
  if (!pin || pin.length < 4) return errorResponse('El PIN debe tener al menos 4 caracteres');
  if (title.length > 200) return errorResponse('El título es demasiado largo (máx 200)');

  const sheet = getSheet('projects');
  const id = generateId();
  const timestamp = now();

  const row = [
    id,
    title,
    (body.description || '').substring(0, 500),
    youtubeVideoId,
    hashPin(pin),
    'draft',
    timestamp,
    timestamp
  ];

  sheet.appendRow(row);

  return jsonResponse({
    ok: true,
    project: { id: id, title: title, youtube_video_id: youtubeVideoId, status: 'draft' }
  });
}

function handleUpdateProject(body) {
  if (!requireEditor(body)) return errorResponse('No autorizado', 401);

  const sheet = getSheet('projects');
  const rowIdx = findRowIndex(sheet, 'id', body.projectId);
  if (rowIdx < 0) return errorResponse('Proyecto no encontrado', 404);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = sheet.getRange(rowIdx, 1, 1, sheet.getLastColumn()).getValues()[0];

  if (body.title !== undefined) row[headers.indexOf('title')] = String(body.title).substring(0, 200);
  if (body.description !== undefined) row[headers.indexOf('description')] = String(body.description).substring(0, 500);
  if (body.youtube_video_id !== undefined) row[headers.indexOf('youtube_video_id')] = String(body.youtube_video_id).trim();
  if (body.status !== undefined && ['draft', 'published'].indexOf(body.status) >= 0) {
    row[headers.indexOf('status')] = body.status;
  }
  row[headers.indexOf('updated_at')] = now();

  sheet.getRange(rowIdx, 1, 1, row.length).setValues([row]);

  return jsonResponse({ ok: true });
}

// ============================================================
// UNLOCK / LOCK (Sesión de edición)
// ============================================================
function handleUnlock(body) {
  const projectId = (body.projectId || '').trim();
  const pin = (body.pin || '').trim();

  if (!projectId || !pin) return errorResponse('projectId y pin son obligatorios');

  // Rate limiting
  const rl = checkRateLimit(projectId);
  if (!rl.allowed) return errorResponse(rl.message, 429);

  // Buscar proyecto
  const projSheet = getSheet('projects');
  const projects = sheetToObjects(projSheet);
  const project = projects.find(function(p) { return String(p.id) === String(projectId); });
  if (!project) return errorResponse('Proyecto no encontrado', 404);

  // Verificar PIN
  const inputHash = hashPin(pin);
  if (inputHash !== project.edit_pin_hash) {
    incrementAttempts(projectId);
    return errorResponse('PIN incorrecto', 403);
  }

  // PIN correcto — resetear intentos y crear sesión
  resetAttempts(projectId);

  const sessSheet = getSheet('edit_sessions');
  const token = generateId();
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 horas

  // Limpiar sesiones viejas de este proyecto
  const sessions = sheetToObjects(sessSheet);
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (String(sessions[i].project_id) === String(projectId)) {
      deleteRow(sessSheet, 'token', sessions[i].token);
    }
  }

  sessSheet.appendRow([projectId, token, expiresAt]);

  return jsonResponse({ ok: true, token: token, expiresAt: expiresAt });
}

function handleLock(body) {
  const projectId = (body.projectId || '').trim();
  const token = (body.editToken || '').trim();

  if (projectId && token) {
    const sheet = getSheet('edit_sessions');
    deleteRow(sheet, 'token', token);
  }

  return jsonResponse({ ok: true });
}

// ============================================================
// SEGMENTS
// ============================================================
function handleGetSegments(params) {
  const projectId = params.projectId;
  if (!projectId) return errorResponse('projectId es obligatorio');

  const sheet = getSheet('segments');
  const all = sheetToObjects(sheet);
  let segments = all.filter(function(s) { return String(s.project_id) === String(projectId); });

  // Ordenar por order_index
  segments.sort(function(a, b) { return Number(a.order_index) - Number(b.order_index); });

  // Recalcular edited times
  segments = recalcEditedTimes(segments);

  return jsonResponse({ ok: true, segments: segments });
}

function handleSaveSegment(body) {
  if (!requireEditor(body)) return errorResponse('No autorizado', 401);

  const projectId = (body.projectId || '').trim();
  if (!projectId) return errorResponse('projectId es obligatorio');

  const sourceStartMs = parseInt(body.source_start_ms, 10);
  const sourceEndMs = parseInt(body.source_end_ms, 10);

  if (isNaN(sourceStartMs) || isNaN(sourceEndMs)) return errorResponse('source_start_ms y source_end_ms deben ser números enteros');
  if (sourceStartMs < 0) return errorResponse('source_start_ms no puede ser negativo');
  if (sourceEndMs <= sourceStartMs) return errorResponse('source_end_ms debe ser mayor que source_start_ms');
  if ((sourceEndMs - sourceStartMs) < 500) return errorResponse('El segmento es muy corto (mínimo 500ms)');

  const title = String(body.title || '').substring(0, 200);

  const sheet = getSheet('segments');
  const timestamp = now();

  if (body.id) {
    // Actualizar segmento existente
    const rowIdx = findRowIndex(sheet, 'id', body.id);
    if (rowIdx < 0) return errorResponse('Segmento no encontrado', 404);

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = sheet.getRange(rowIdx, 1, 1, sheet.getLastColumn()).getValues()[0];

    row[headers.indexOf('title')] = title;
    row[headers.indexOf('source_start_ms')] = sourceStartMs;
    row[headers.indexOf('source_end_ms')] = sourceEndMs;
    row[headers.indexOf('updated_at')] = timestamp;

    sheet.getRange(rowIdx, 1, 1, row.length).setValues([row]);

    return jsonResponse({ ok: true, id: body.id });
  } else {
    // Crear nuevo segmento
    const all = sheetToObjects(sheet);
    const projectSegments = all.filter(function(s) { return String(s.project_id) === String(projectId); });

    // Verificar solapamientos
    for (let i = 0; i < projectSegments.length; i++) {
      const s = projectSegments[i];
      const sStart = Number(s.source_start_ms);
      const sEnd = Number(s.source_end_ms);
      if (sourceStartMs < sEnd && sourceEndMs > sStart) {
        return errorResponse('El segmento se solapa con "' + (s.title || 'Segmento ' + s.order_index) + '" (' + sStart + 'ms - ' + sEnd + 'ms)');
      }
    }

    const id = generateId();
    const orderIndex = projectSegments.length;

    const row = [id, projectId, orderIndex, title, sourceStartMs, sourceEndMs, 0, 0, timestamp, timestamp];
    sheet.appendRow(row);

    return jsonResponse({ ok: true, id: id });
  }
}

function handleDeleteSegment(body) {
  if (!requireEditor(body)) return errorResponse('No autorizado', 401);

  const segmentId = (body.segmentId || '').trim();
  if (!segmentId) return errorResponse('segmentId es obligatorio');

  const sheet = getSheet('segments');
  const deleted = deleteRow(sheet, 'id', segmentId);

  if (!deleted) return errorResponse('Segmento no encontrado', 404);
  return jsonResponse({ ok: true });
}

function handleReorderSegments(body) {
  if (!requireEditor(body)) return errorResponse('No autorizado', 401);

  const orderedIds = body.orderedIds;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return errorResponse('orderedIds debe ser un arreglo no vacío');
  }

  const sheet = getSheet('segments');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const orderCol = headers.indexOf('order_index');
  const idCol = headers.indexOf('id');
  const data = sheet.getDataRange().getValues();

  for (let i = 0; i < orderedIds.length; i++) {
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][idCol]) === String(orderedIds[i])) {
        sheet.getRange(r + 1, orderCol + 1).setValue(i);
        break;
      }
    }
  }

  return jsonResponse({ ok: true });
}

function recalcEditedTimes(segments) {
  let cursor = 0;
  for (let i = 0; i < segments.length; i++) {
    const duration = Number(segments[i].source_end_ms) - Number(segments[i].source_start_ms);
    segments[i].edited_start_ms = cursor;
    segments[i].edited_end_ms = cursor + duration;
    cursor += duration;
  }
  return segments;
}

// ============================================================
// COMMENTS
// ============================================================
function handleGetComments(params) {
  const projectId = params.projectId;
  if (!projectId) return errorResponse('projectId es obligatorio');

  const sheet = getSheet('comments');
  const all = sheetToObjects(sheet);
  let comments = all.filter(function(c) { return String(c.project_id) === String(projectId); });

  // Ordenar por edited_time_ms
  comments.sort(function(a, b) { return Number(a.edited_time_ms) - Number(b.edited_time_ms); });

  return jsonResponse({ ok: true, comments: comments });
}

function handleAddComment(body) {
  const projectId = (body.projectId || '').trim();
  const text = (body.text || '').trim();
  const editedTimeMs = parseInt(body.edited_time_ms, 10);
  const sourceTimeMs = parseInt(body.source_time_ms, 10);
  const authorLabel = String(body.author_label || 'Anónimo').substring(0, 50);

  if (!projectId) return errorResponse('projectId es obligatorio');
  if (!text) return errorResponse('El texto del comentario es obligatorio');
  if (text.length > 1000) return errorResponse('El comentario es demasiado largo (máx 1000 caracteres)');
  if (isNaN(editedTimeMs) || editedTimeMs < 0) return errorResponse('edited_time_ms inválido');
  if (isNaN(sourceTimeMs) || sourceTimeMs < 0) return errorResponse('source_time_ms inválido');

  const sheet = getSheet('comments');
  const id = generateId();
  const timestamp = now();

  sheet.appendRow([id, projectId, editedTimeMs, sourceTimeMs, authorLabel, text, timestamp]);

  return jsonResponse({
    ok: true,
    comment: {
      id: id,
      project_id: projectId,
      edited_time_ms: editedTimeMs,
      source_time_ms: sourceTimeMs,
      author_label: authorLabel,
      text: text,
      created_at: timestamp
    }
  });
}

function handleDeleteComment(body) {
  if (!requireEditor(body)) return errorResponse('No autorizado', 401);

  const commentId = (body.commentId || '').trim();
  if (!commentId) return errorResponse('commentId es obligatorio');

  const sheet = getSheet('comments');
  const deleted = deleteRow(sheet, 'id', commentId);
  if (!deleted) return errorResponse('Comentario no encontrado', 404);

  return jsonResponse({ ok: true });
}
