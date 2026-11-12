const fs = require('node:fs/promises');
const { pool } = require('../../config/db');
const { processPdf, summarizePdf } = require('../../config/pythonApi');
const { resolveStoredFilePath } = require('./documents.service');

const activeJobs = new Set();
const SUMMARY_FIELDS = [
  'title', 'authors', 'abstract', 'problem_statement',
  'methodology', 'key_results', 'conclusion',
];

function jobKey(userId, documentId, kind) {
  return `${userId}:${documentId}:${kind}`;
}

function isDocumentJobActive(userId, documentId) {
  return activeJobs.has(jobKey(userId, documentId, 'index'))
    || activeJobs.has(jobKey(userId, documentId, 'summary'));
}

function startJob(userId, documentId, kind, run) {
  const key = jobKey(userId, documentId, kind);
  if (activeJobs.has(key)) return false;
  activeJobs.add(key);
  Promise.resolve()
    .then(() => run(userId, documentId))
    .catch(() => console.error(`Document ${kind} job could not be completed.`))
    .finally(() => activeJobs.delete(key));
  return true;
}

function safeJobError(error, kind) {
  if (error && error.code === 'ENOENT') return 'The uploaded PDF could not be found.';
  if (error && error.code === 'AI_SERVICE_UNAVAILABLE') {
    return `The AI service could not complete ${kind}. Please try again later.`;
  }
  return `Document ${kind} failed. Please try again later.`;
}

async function loadStoredDocument(userId, documentId) {
  const [rows] = await pool.execute(
    `SELECT file_name, file_path, status, summary_status FROM documents
     WHERE id = ? AND user_id = ? LIMIT 1`,
    [documentId, userId],
  );
  return rows[0] || null;
}

async function runIndex(userId, documentId) {
  await pool.execute(
    `UPDATE documents SET status = 'processing', processing_error = NULL
     WHERE id = ? AND user_id = ? AND status IN ('uploaded', 'processing')`,
    [documentId, userId],
  );
  try {
    const document = await loadStoredDocument(userId, documentId);
    if (!document || document.status !== 'processing') return;
    const filePath = resolveStoredFilePath(document.file_path);
    const pdfBytes = await fs.readFile(filePath);
    const result = await processPdf(pdfBytes, document.file_name, {
      user_id: userId,
      document_id: documentId,
      file_name: document.file_name,
      file_path: filePath,
    });
    if (!result || result.status !== 'indexed'
      || !Number.isSafeInteger(result.page_count) || result.page_count < 1
      || !Number.isSafeInteger(result.chunk_count) || result.chunk_count < 1) {
      throw new Error('Invalid indexing response');
    }
    await pool.execute(
      `UPDATE documents SET status = 'ready', processing_error = NULL,
       page_count = ?, chunk_count = ?
       WHERE id = ? AND user_id = ? AND status = 'processing'`,
      [result.page_count, result.chunk_count, documentId, userId],
    );
  } catch (error) {
    await pool.execute(
      `UPDATE documents SET status = 'failed', processing_error = ?
       WHERE id = ? AND user_id = ? AND status = 'processing'`,
      [safeJobError(error, 'indexing'), documentId, userId],
    );
  }
}

function validSummary(summary) {
  return summary && typeof summary === 'object'
    && SUMMARY_FIELDS.every((field) => field === 'authors'
      ? Array.isArray(summary.authors) && summary.authors.every((name) => typeof name === 'string')
      : typeof summary[field] === 'string');
}

async function saveCompletedSummary(userId, documentId, fileName, summary) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id FROM documents WHERE id = ? AND user_id = ?
       AND summary_status = 'processing' FOR UPDATE`,
      [documentId, userId],
    );
    if (!rows.length) {
      await connection.rollback();
      return;
    }
    const json = JSON.stringify(summary);
    await connection.execute(
      `UPDATE documents SET summary_status = 'completed', summary_json = ?, summary_error = NULL
       WHERE id = ? AND user_id = ? AND summary_status = 'processing'`,
      [json, documentId, userId],
    );
    await connection.execute(
      `INSERT INTO summary_history (user_id, document_id, pdf_name, summary_json)
       VALUES (?, ?, ?, ?)`,
      [userId, documentId, fileName, json],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function runSummary(userId, documentId) {
  await pool.execute(
    `UPDATE documents SET summary_status = 'processing', summary_error = NULL
     WHERE id = ? AND user_id = ? AND summary_status IN ('pending', 'processing')`,
    [documentId, userId],
  );
  try {
    const document = await loadStoredDocument(userId, documentId);
    if (!document || document.summary_status !== 'processing') return;
    const pdfBytes = await fs.readFile(resolveStoredFilePath(document.file_path));
    const summary = await summarizePdf(pdfBytes, document.file_name);
    if (!validSummary(summary)) throw new Error('Invalid summary response');
    await saveCompletedSummary(userId, documentId, document.file_name, summary);
  } catch (error) {
    await pool.execute(
      `UPDATE documents SET summary_status = 'failed', summary_error = ?
       WHERE id = ? AND user_id = ? AND summary_status = 'processing'`,
      [safeJobError(error, 'summary generation'), documentId, userId],
    );
  }
}

function scheduleDocumentJobs(userId, documentId, { index = true, summary = true } = {}) {
  if (index) startJob(userId, documentId, 'index', runIndex);
  if (summary) startJob(userId, documentId, 'summary', runSummary);
}

async function resumeDocumentJobs() {
  const [rows] = await pool.execute(
    `SELECT id, user_id, status, summary_status FROM documents
     WHERE status IN ('uploaded', 'processing')
        OR summary_status IN ('pending', 'processing')`,
  );
  for (const row of rows) {
    scheduleDocumentJobs(row.user_id, row.id, {
      index: row.status === 'uploaded' || row.status === 'processing',
      summary: row.summary_status === 'pending' || row.summary_status === 'processing',
    });
  }
  return rows.length;
}

module.exports = { scheduleDocumentJobs, resumeDocumentJobs, isDocumentJobActive };
