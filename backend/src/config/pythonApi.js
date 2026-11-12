const axios = require('axios');

function aiEndpoint(path) {
  const configuredUrl = process.env.PYTHON_AI_SERVICE_URL;
  if (!configuredUrl) {
    const error = new Error('AI service URL is not configured');
    error.code = 'AI_SERVICE_UNAVAILABLE';
    throw error;
  }
  try {
    const base = new URL(configuredUrl);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Invalid protocol');
    return new URL(path, base).toString();
  } catch (_error) {
    const error = new Error('AI service URL is invalid');
    error.code = 'AI_SERVICE_UNAVAILABLE';
    throw error;
  }
}

function unavailableError() {
  const error = new Error('AI service is unavailable or could not answer');
  error.code = 'AI_SERVICE_UNAVAILABLE';
  return error;
}

async function askAiService(payload) {
  try {
    const response = await axios.post(aiEndpoint('/internal/chat'), payload, {
      timeout: 180000,
      headers: { 'Content-Type': 'application/json' },
    });
    return response.data;
  } catch (_error) {
    throw unavailableError();
  }
}

async function postPdf(path, pdfBytes, fileName, fields = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, String(value));
  }
  form.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), fileName);
  try {
    const response = await axios.post(aiEndpoint(path), form, {
      timeout: 300000,
      maxBodyLength: Infinity,
    });
    return response.data;
  } catch (_error) {
    throw unavailableError();
  }
}

function processPdf(pdfBytes, fileName, fields) {
  return postPdf('/internal/documents/process', pdfBytes, fileName, fields);
}

function summarizePdf(pdfBytes, fileName) {
  return postPdf('/internal/documents/summary', pdfBytes, fileName);
}

async function deleteIndexedDocument(userId, documentId) {
  try {
    await axios.delete(aiEndpoint(`/internal/documents/${documentId}`), {
      params: { user_id: userId },
      timeout: 30000,
    });
  } catch (_error) {
    throw unavailableError();
  }
}

module.exports = { askAiService, processPdf, summarizePdf, deleteIndexedDocument };
