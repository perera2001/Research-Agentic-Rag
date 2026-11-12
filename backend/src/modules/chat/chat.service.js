const path = require('node:path');
const { pool } = require('../../config/db');
const { askAiService } = require('../../config/pythonApi');
const { resolveStoredFilePath } = require('../documents/documents.service');

function chatError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseSources(value) {
  if (value == null) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.source === 'string'
      && Number.isSafeInteger(item.page_number) && item.page_number > 0
      && Number.isSafeInteger(item.document_id) && item.document_id > 0)
      .map(({ source, page_number, document_id }) => ({
        source: path.posix.basename(path.win32.basename(source)), page_number, document_id,
      }));
  } catch (_error) {
    return [];
  }
}

function toPublicSession(row) {
  return {
    id: row.id,
    title: row.title,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toPublicMessage(row) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    sources: parseSources(row.sources),
    created_at: row.created_at,
  };
}

async function getOwnedSession(userId, sessionId, executor = pool) {
  const [rows] = await executor.execute(
    'SELECT id, title, created_at, updated_at FROM chat_sessions WHERE id = ? AND user_id = ? LIMIT 1',
    [sessionId, userId],
  );
  return rows[0] || null;
}

async function getSessionMessages(userId, sessionId) {
  const [rows] = await pool.execute(
    `SELECT id, role, content, sources, created_at FROM chat_messages
     WHERE session_id = ? AND user_id = ? ORDER BY created_at ASC, id ASC`,
    [sessionId, userId],
  );
  return rows;
}

async function getEligibleDocuments(userId, selectedIds) {
  const [rows] = await pool.execute(
    `SELECT id, file_name, file_path FROM documents
     WHERE user_id = ? AND status = 'ready' ORDER BY id ASC`,
    [userId],
  );
  if (selectedIds === null) return rows;

  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  if (selectedIds.some((id) => !byId.has(id))) {
    throw chatError(400, 'One or more documents are unavailable for chat');
  }
  return selectedIds.map((id) => byId.get(id));
}

function validateAiResponse(data, documents) {
  if (!data || typeof data.answer !== 'string' || !data.answer.trim() || !Array.isArray(data.sources)
    || !Number.isSafeInteger(data.retry_count) || data.retry_count < 0
    || typeof data.documents_relevant !== 'boolean' || typeof data.grounded !== 'boolean') {
    throw chatError(502, 'AI service returned an invalid response');
  }
  if (parseSources(data.sources).length !== data.sources.length) {
    throw chatError(502, 'AI service returned invalid sources');
  }
  const namesById = new Map(documents.map((document) => [Number(document.document_id), document.file_name]));
  const sources = parseSources(data.sources);
  if (sources.some((source) => !namesById.has(source.document_id))) {
    throw chatError(502, 'AI service returned sources outside the available documents');
  }
  return {
    answer: data.answer,
    sources: sources.map((source) => ({ ...source, source: namesById.get(source.document_id) })),
    retry_count: data.retry_count,
    documents_relevant: data.documents_relevant,
    grounded: data.grounded,
  };
}

async function saveChat(userId, question, sessionId, aiResponse) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let savedSessionId = sessionId;
    if (savedSessionId === null) {
      const [result] = await connection.execute(
        'INSERT INTO chat_sessions (user_id, title) VALUES (?, ?)',
        [userId, Array.from(question).slice(0, 80).join('')],
      );
      savedSessionId = result.insertId;
    } else {
      const [rows] = await connection.execute(
        'SELECT id FROM chat_sessions WHERE id = ? AND user_id = ? FOR UPDATE',
        [savedSessionId, userId],
      );
      if (!rows.length) throw chatError(404, 'Chat session not found');
    }

    await connection.execute(
      "INSERT INTO chat_messages (user_id, session_id, role, content) VALUES (?, ?, 'user', ?)",
      [userId, savedSessionId, question],
    );
    await connection.execute(
      "INSERT INTO chat_messages (user_id, session_id, role, content, sources) VALUES (?, ?, 'assistant', ?, ?)",
      [userId, savedSessionId, aiResponse.answer, JSON.stringify(aiResponse.sources)],
    );
    await connection.execute(
      'UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [savedSessionId, userId],
    );
    await connection.commit();
    return savedSessionId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function sendChat({ userId, question, sessionId, documentIds }) {
  let history = [];
  if (sessionId !== null) {
    if (!await getOwnedSession(userId, sessionId)) {
      throw chatError(404, 'Chat session not found');
    }
    history = (await getSessionMessages(userId, sessionId))
      .filter((row) => row.role === 'user' || row.role === 'assistant')
      .map(({ role, content }) => ({ role, content }));
  }

  const documents = await getEligibleDocuments(userId, documentIds);
  const availableDocuments = documents.map((document) => ({
    document_id: document.id,
    file_name: document.file_name,
    file_path: resolveStoredFilePath(document.file_path),
  }));
  const aiResponse = validateAiResponse(await askAiService({
    user_id: userId,
    question,
    chat_history: history,
    available_documents: availableDocuments,
    selected_document_ids: documentIds,
  }), availableDocuments);
  const savedSessionId = await saveChat(userId, question, sessionId, aiResponse);
  return { session_id: savedSessionId, ...aiResponse };
}

async function listSessions(userId) {
  const [rows] = await pool.execute(
    'SELECT id, title, created_at, updated_at FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC, id DESC',
    [userId],
  );
  return rows.map(toPublicSession);
}

async function readSession(userId, sessionId) {
  const session = await getOwnedSession(userId, sessionId);
  if (!session) throw chatError(404, 'Chat session not found');
  const messages = await getSessionMessages(userId, sessionId);
  return { session: toPublicSession(session), messages: messages.map(toPublicMessage) };
}

async function deleteSession(userId, sessionId) {
  const [result] = await pool.execute(
    'DELETE FROM chat_sessions WHERE id = ? AND user_id = ?',
    [sessionId, userId],
  );
  if (result.affectedRows !== 1) throw chatError(404, 'Chat session not found');
}

module.exports = { sendChat, listSessions, readSession, deleteSession };
