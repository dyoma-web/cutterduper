/**
 * CutterDuper — Google Apps Script Backend
 * =========================================
 * Deploy como Web App: Execute as me, Anyone can access.
 */

// ============================================================
// CONFIGURACION
// ============================================================
const SHEET_ID = ''; // <-- Pegar aqui el ID del Google Sheet

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
  } else {
    // Ensure all expected columns exist (auto-migrate)
    const expected = SHEET_HEADERS[name];
    if (expected) {
      const lastCol = sheet.getLastColumn();
      const currentHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
      for (let i = 0; i < expected.length; i++) {
        if (currentHeaders.indexOf(expected[i]) === -1) {
          // Add missing column at the end
          const newCol = sheet.getLastColumn() + 1;
          sheet.getRange(1, newCol).setValue(expected[i]);
        }
      }
    }
  }
  return sheet;
}

const SHEET_HEADERS = {
  projects: ['id', 'title', 'description', 'youtube_video_id', 'edit_pin_hash', 'status', 'created_at', 'updated_at'],
  segments: ['id', 'project_id', 'order_index', 'title', 'source_start_ms', 'source_end_ms', 'edited_start_ms', 'edited_end_ms', 'category_id', 'color', 'created_at', 'updated_at'],
  categories: ['id', 'project_id', 'name', 'color', 'created_at'],
  comments: ['id', 'project_id', 'edited_time_ms', 'source_time_ms', 'author_label', 'text', 'created_at'],
  edit_sessions: ['project_id', 'token', 'expires_at']
};

// ============================================================
// UTILIDADES
// ============================================================
function generateId() { return Utilities.getUuid(); }
function now() { return new Date().toISOString(); }

function hashPin(pin) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pin);
  return raw.map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
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
    for (let j = 0; j < headers.length; j++) { obj[headers[j]] = data[i][j]; }
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
    if (String(data[i][colIdx]) === String(value)) return i + 1;
  }
  return -1;
}

function deleteRow(sheet, colName, value) {
  const rowIdx = findRowIndex(sheet, colName, value);
  if (rowIdx > 0) { sheet.deleteRow(rowIdx); return true; }
  return false;
}

function updateCell(sheet, rowIdx, colName, value) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIdx = headers.indexOf(colName);
  if (colIdx >= 0) sheet.getRange(rowIdx, colIdx + 1).setValue(value);
}

/**
 * Appends a row using a key-value object, mapping to column headers.
 * This works regardless of column order.
 */
function appendRowByHeaders(sheet, dataObj) {
  const lastCol = sheet.getLastColumn();
  const headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const row = [];
  for (let i = 0; i < headers.length; i++) {
    row.push(dataObj.hasOwnProperty(headers[i]) ? dataObj[headers[i]] : '');
  }
  sheet.appendRow(row);
}

// ============================================================
// SESION DE EDICION
// ============================================================
function isValidSession(projectId, token) {
  if (!token) return false;
  const sheet = getSheet('edit_sessions');
  const sessions = sheetToObjects(sheet);
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    if (String(s.project_id) === String(projectId) && String(s.token) === String(token)) {
      if (new Date(s.expires_at) > new Date()) return true;
      deleteRow(sheet, 'token', token);
      return false;
    }
  }
  return false;
}

function requireEditor(params) {
  return isValidSession(params.projectId, params.editToken);
}

// ============================================================
// RATE LIMITING
// ============================================================
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
    props.setProperty(lockKey, new Date(Date.now() + 5 * 60 * 1000).toISOString());
    props.setProperty(key, '0');
    return { allowed: false, message: 'Demasiados intentos. Intente en 5 minutos.' };
  }
  return { allowed: true, attempts: attempts };
}

function incrementAttempts(projectId) {
  const props = PropertiesService.getScriptProperties();
  const key = 'pin_attempts_' + projectId;
  props.setProperty(key, String(parseInt(props.getProperty(key) || '0', 10) + 1));
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
      case 'getProject': return handleGetProject(params);
      case 'getSegments': return handleGetSegments(params);
      case 'getComments': return handleGetComments(params);
      case 'getCategories': return handleGetCategories(params);
      case 'ping': return jsonResponse({ ok: true, message: 'CutterDuper API running' });
      default: return errorResponse('Accion GET no reconocida: ' + action);
    }
  } catch (err) { return errorResponse('Error interno: ' + err.message, 500); }
}

// ============================================================
// HANDLERS — POST
// ============================================================
function doPost(e) {
  let body = {};
  try {
    if (e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
  } catch (err) { return errorResponse('JSON invalido en el body'); }

  const action = body.action || '';
  try {
    switch (action) {
      case 'createProject': return handleCreateProject(body);
      case 'updateProject': return handleUpdateProject(body);
      case 'unlock': return handleUnlock(body);
      case 'lock': return handleLock(body);
      case 'saveSegment': return handleSaveSegment(body);
      case 'deleteSegment': return handleDeleteSegment(body);
      case 'reorderSegments': return handleReorderSegments(body);
      case 'addComment': return handleAddComment(body);
      case 'deleteComment': return handleDeleteComment(body);
      case 'saveCategory': return handleSaveCategory(body);
      case 'deleteCategory': return handleDeleteCategory(body);
      default: return errorResponse('Accion POST no reconocida: ' + action);
    }
  } catch (err) { return errorResponse('Error interno: ' + err.message, 500); }
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
    delete project.edit_pin_hash;
    return jsonResponse({ ok: true, project: project });
  }
  projects.forEach(function(p) { delete p.edit_pin_hash; });
  return jsonResponse({ ok: true, projects: projects });
}

function handleCreateProject(body) {
  const title = (body.title || '').trim();
  const youtubeVideoId = (body.youtube_video_id || '').trim();
  const pin = (body.pin || '').trim();
  if (!title) return errorResponse('El titulo es obligatorio');
  if (!youtubeVideoId) return errorResponse('El ID de video de YouTube es obligatorio');
  if (!pin || pin.length < 4) return errorResponse('El PIN debe tener al menos 4 caracteres');
  if (title.length > 200) return errorResponse('El titulo es demasiado largo (max 200)');

  const sheet = getSheet('projects');
  const id = generateId();
  const timestamp = now();
  appendRowByHeaders(sheet, { id: id, title: title, description: (body.description || '').substring(0, 500), youtube_video_id: youtubeVideoId, edit_pin_hash: hashPin(pin), status: 'draft', created_at: timestamp, updated_at: timestamp });
  return jsonResponse({ ok: true, project: { id: id, title: title, youtube_video_id: youtubeVideoId, status: 'draft' } });
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
  if (body.status !== undefined && ['draft', 'published'].indexOf(body.status) >= 0) row[headers.indexOf('status')] = body.status;
  row[headers.indexOf('updated_at')] = now();
  sheet.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  return jsonResponse({ ok: true });
}

// ============================================================
// UNLOCK / LOCK
// ============================================================
function handleUnlock(body) {
  const projectId = (body.projectId || '').trim();
  const pin = (body.pin || '').trim();
  if (!projectId || !pin) return errorResponse('projectId y pin son obligatorios');
  const rl = checkRateLimit(projectId);
  if (!rl.allowed) return errorResponse(rl.message, 429);
  const projSheet = getSheet('projects');
  const projects = sheetToObjects(projSheet);
  const project = projects.find(function(p) { return String(p.id) === String(projectId); });
  if (!project) return errorResponse('Proyecto no encontrado', 404);
  if (hashPin(pin) !== project.edit_pin_hash) { incrementAttempts(projectId); return errorResponse('PIN incorrecto', 403); }
  resetAttempts(projectId);
  const sessSheet = getSheet('edit_sessions');
  const token = generateId();
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const sessions = sheetToObjects(sessSheet);
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (String(sessions[i].project_id) === String(projectId)) deleteRow(sessSheet, 'token', sessions[i].token);
  }
  appendRowByHeaders(sessSheet, { project_id: projectId, token: token, expires_at: expiresAt });
  return jsonResponse({ ok: true, token: token, expiresAt: expiresAt });
}

function handleLock(body) {
  const projectId = (body.projectId || '').trim();
  const token = (body.editToken || '').trim();
  if (projectId && token) deleteRow(getSheet('edit_sessions'), 'token', token);
  return jsonResponse({ ok: true });
}

// ============================================================
// CATEGORIES
// ============================================================
function handleGetCategories(params) {
  const projectId = params.projectId;
  if (!projectId) return errorResponse('projectId es obligatorio');
  const sheet = getSheet('categories');
  const all = sheetToObjects(sheet);
  const categories = all.filter(function(c) { return String(c.project_id) === String(projectId); });
  return jsonResponse({ ok: true, categories: categories });
}

function handleSaveCategory(body) {
  if (!requireEditor(body)) return errorResponse('No autorizado', 401);
  const projectId = (body.projectId || '').trim();
  const name = (body.name || '').trim();
  const color = (body.color || '#3b82f6').trim();
  if (!projectId) return errorResponse('projectId es obligatorio');
  if (!name) return errorResponse('El nombre es obligatorio');
  if (name.length > 50) return errorResponse('Nombre muy largo (max 50)');

  const sheet = getSheet('categories');

  if (body.id) {
    const rowIdx = findRowIndex(sheet, 'id', body.id);
    if (rowIdx < 0) return errorResponse('Categoria no encontrada', 404);
    updateCell(sheet, rowIdx, 'name', name);
    updateCell(sheet, rowIdx, 'color', color);
    return jsonResponse({ ok: true, id: body.id });
  } else {
    const id = generateId();
    appendRowByHeaders(sheet, { id: id, project_id: projectId, name: name, color: color, created_at: now() });
    return jsonResponse({ ok: true, id: id });
  }
}

function handleDeleteCategory(body) {
  if (!requireEditor(body)) return errorResponse('No autorizado', 401);
  const categoryId = (body.categoryId || '').trim();
  if (!categoryId) return errorResponse('categoryId es obligatorio');
  const deleted = deleteRow(getSheet('categories'), 'id', categoryId);
  if (!deleted) return errorResponse('Categoria no encontrada', 404);
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
  segments.sort(function(a, b) { return Number(a.order_index) - Number(b.order_index); });
  segments = recalcEditedTimes(segments);
  return jsonResponse({ ok: true, segments: segments });
}

function handleSaveSegment(body) {
  if (!requireEditor(body)) return errorResponse('No autorizado', 401);
  const projectId = (body.projectId || '').trim();
  if (!projectId) return errorResponse('projectId es obligatorio');
  const sourceStartMs = parseInt(body.source_start_ms, 10);
  const sourceEndMs = parseInt(body.source_end_ms, 10);
  if (isNaN(sourceStartMs) || isNaN(sourceEndMs)) return errorResponse('source_start_ms y source_end_ms deben ser numeros enteros');
  if (sourceStartMs < 0) return errorResponse('source_start_ms no puede ser negativo');
  if (sourceEndMs <= sourceStartMs) return errorResponse('source_end_ms debe ser mayor que source_start_ms');
  if ((sourceEndMs - sourceStartMs) < 500) return errorResponse('El segmento es muy corto (minimo 500ms)');

  const title = String(body.title || '').substring(0, 200);
  const categoryId = String(body.category_id || '');
  const color = String(body.color || '');
  const sheet = getSheet('segments');
  const timestamp = now();

  if (body.id) {
    const rowIdx = findRowIndex(sheet, 'id', body.id);
    if (rowIdx < 0) return errorResponse('Segmento no encontrado', 404);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const row = sheet.getRange(rowIdx, 1, 1, sheet.getLastColumn()).getValues()[0];
    row[headers.indexOf('title')] = title;
    row[headers.indexOf('source_start_ms')] = sourceStartMs;
    row[headers.indexOf('source_end_ms')] = sourceEndMs;
    if (headers.indexOf('category_id') >= 0) row[headers.indexOf('category_id')] = categoryId;
    if (headers.indexOf('color') >= 0) row[headers.indexOf('color')] = color;
    row[headers.indexOf('updated_at')] = timestamp;
    sheet.getRange(rowIdx, 1, 1, row.length).setValues([row]);
    return jsonResponse({ ok: true, id: body.id });
  } else {
    const all = sheetToObjects(sheet);
    const projectSegments = all.filter(function(s) { return String(s.project_id) === String(projectId); });
    for (let i = 0; i < projectSegments.length; i++) {
      const s = projectSegments[i];
      const sStart = Number(s.source_start_ms);
      const sEnd = Number(s.source_end_ms);
      if (sourceStartMs < sEnd && sourceEndMs > sStart) {
        return errorResponse('El segmento se solapa con "' + (s.title || 'Segmento ' + s.order_index) + '"');
      }
    }
    const id = generateId();
    const orderIndex = projectSegments.length;
    appendRowByHeaders(sheet, { id: id, project_id: projectId, order_index: orderIndex, title: title, source_start_ms: sourceStartMs, source_end_ms: sourceEndMs, edited_start_ms: 0, edited_end_ms: 0, category_id: categoryId, color: color, created_at: timestamp, updated_at: timestamp });
    return jsonResponse({ ok: true, id: id });
  }
}

function handleDeleteSegment(body) {
  if (!requireEditor(body)) return errorResponse('No autorizado', 401);
  const segmentId = (body.segmentId || '').trim();
  if (!segmentId) return errorResponse('segmentId es obligatorio');
  if (!deleteRow(getSheet('segments'), 'id', segmentId)) return errorResponse('Segmento no encontrado', 404);
  return jsonResponse({ ok: true });
}

function handleReorderSegments(body) {
  if (!requireEditor(body)) return errorResponse('No autorizado', 401);
  const orderedIds = body.orderedIds;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return errorResponse('orderedIds debe ser un arreglo no vacio');
  const sheet = getSheet('segments');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const orderCol = headers.indexOf('order_index');
  const idCol = headers.indexOf('id');
  const data = sheet.getDataRange().getValues();
  for (let i = 0; i < orderedIds.length; i++) {
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][idCol]) === String(orderedIds[i])) { sheet.getRange(r + 1, orderCol + 1).setValue(i); break; }
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
  comments.sort(function(a, b) { return Number(a.source_time_ms) - Number(b.source_time_ms); });
  return jsonResponse({ ok: true, comments: comments });
}

function handleAddComment(body) {
  const projectId = (body.projectId || '').trim();
  const text = (body.text || '').trim();
  const editedTimeMs = parseInt(body.edited_time_ms, 10);
  const sourceTimeMs = parseInt(body.source_time_ms, 10);
  const authorLabel = String(body.author_label || 'Anonimo').substring(0, 50);
  if (!projectId) return errorResponse('projectId es obligatorio');
  if (!text) return errorResponse('El texto del comentario es obligatorio');
  if (text.length > 1000) return errorResponse('Comentario muy largo (max 1000)');
  if (isNaN(editedTimeMs) || editedTimeMs < 0) return errorResponse('edited_time_ms invalido');
  if (isNaN(sourceTimeMs) || sourceTimeMs < 0) return errorResponse('source_time_ms invalido');
  const sheet = getSheet('comments');
  const id = generateId();
  const timestamp = now();
  appendRowByHeaders(sheet, { id: id, project_id: projectId, edited_time_ms: editedTimeMs, source_time_ms: sourceTimeMs, author_label: authorLabel, text: text, created_at: timestamp });
  return jsonResponse({ ok: true, comment: { id: id, project_id: projectId, edited_time_ms: editedTimeMs, source_time_ms: sourceTimeMs, author_label: authorLabel, text: text, created_at: timestamp } });
}

function handleDeleteComment(body) {
  if (!requireEditor(body)) return errorResponse('No autorizado', 401);
  const commentId = (body.commentId || '').trim();
  if (!commentId) return errorResponse('commentId es obligatorio');
  if (!deleteRow(getSheet('comments'), 'id', commentId)) return errorResponse('Comentario no encontrado', 404);
  return jsonResponse({ ok: true });
}
