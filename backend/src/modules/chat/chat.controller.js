const chatService = require('./chat.service');

function positiveId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function parseSessionId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return positiveId(id) ? id : null;
}

function sendKnownError(error, res) {
  if (error.status) {
    res.status(error.status).json({ error: error.message });
    return true;
  }
  if (error.code === 'AI_SERVICE_UNAVAILABLE') {
    res.status(502).json({ error: 'AI service is unavailable or could not answer' });
    return true;
  }
  return false;
}

async function send(req, res) {
  const body = req.body || {};
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) {
    return res.status(400).json({ error: 'question is required' });
  }

  const sessionId = body.session_id == null ? null : body.session_id;
  if (sessionId !== null && !positiveId(sessionId)) {
    return res.status(400).json({ error: 'session_id must be a positive integer or null' });
  }

  const documentIds = body.document_ids;
  if (!Array.isArray(documentIds) || documentIds.length !== 1 || !positiveId(documentIds[0])) {
    return res.status(400).json({ error: 'Select exactly one ready research paper before asking a question' });
  }

  try {
    const result = await chatService.sendChat({
      userId: req.user.id,
      question,
      sessionId,
      documentIds,
    });
    return res.json(result);
  } catch (error) {
    if (sendKnownError(error, res)) return;
    throw error;
  }
}

async function list(req, res) {
  const sessions = await chatService.listSessions(req.user.id);
  res.json({ sessions });
}

async function read(req, res) {
  const sessionId = parseSessionId(req.params.sessionId);
  if (sessionId === null) return res.status(400).json({ error: 'Invalid session ID' });
  try {
    return res.json(await chatService.readSession(req.user.id, sessionId));
  } catch (error) {
    if (sendKnownError(error, res)) return;
    throw error;
  }
}

async function remove(req, res) {
  const sessionId = parseSessionId(req.params.sessionId);
  if (sessionId === null) return res.status(400).json({ error: 'Invalid session ID' });
  try {
    await chatService.deleteSession(req.user.id, sessionId);
    return res.json({ message: 'Chat session deleted' });
  } catch (error) {
    if (sendKnownError(error, res)) return;
    throw error;
  }
}

module.exports = { send, list, read, remove };
