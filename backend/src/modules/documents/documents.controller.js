const fs = require('node:fs/promises');
const {
  createDocument, listDocuments, deleteDocument, listRecentSummaries, deleteSavedSummary,
} = require('./documents.service');
const { scheduleDocumentJobs } = require('./document.jobs');

async function upload(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'A PDF file is required in the "file" field' });
  }

  try {
    if (req.file.size === 0) {
      const error = new Error('PDF file must not be empty');
      error.code = 'EMPTY_PDF';
      throw error;
    }

    const document = await createDocument(req.user.id, req.file.originalname, req.file.filename);
    scheduleDocumentJobs(req.user.id, document.id);
    return res.status(201).json({ document });
  } catch (error) {
    await fs.rm(req.file.path, { force: true });
    if (error.code === 'EMPTY_PDF') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'DOCUMENT_EXISTS') {
      return res.status(409).json({ error: 'Document with this filename already exists' });
    }
    throw error;
  }
}

async function list(req, res) {
  const documents = await listDocuments(req.user.id);
  res.json({ documents });
}

async function remove(req, res) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid document ID' });
  }

  let deleted;
  try {
    deleted = await deleteDocument(req.user.id, id);
  } catch (error) {
    if (error.code === 'DOCUMENT_BUSY') {
      return res.status(409).json({ error: error.message });
    }
    if (error.code === 'AI_SERVICE_UNAVAILABLE') {
      return res.status(502).json({ error: 'Could not remove the document from the AI index' });
    }
    throw error;
  }
  if (!deleted) {
    return res.status(404).json({ error: 'Document not found' });
  }

  return res.json({ message: 'Document deleted' });
}

async function listSummaries(req, res) {
  const summaries = await listRecentSummaries(req.user.id);
  res.json({ summaries });
}

async function removeSummary(req, res) {
  const id = Number(req.params.summaryId);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid summary ID' });
  }
  const deleted = await deleteSavedSummary(req.user.id, id);
  if (!deleted) return res.status(404).json({ error: 'Summary not found' });
  return res.json({ message: 'Summary deleted' });
}

module.exports = { upload, list, remove, listSummaries, removeSummary };
