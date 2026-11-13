const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { createReadStream } = require('node:fs');
const fs = require('node:fs/promises');
const { pool } = require('../../config/db');
const { deleteIndexedDocument } = require('../../config/pythonApi');

function getUploadDirectory() {
  if (!process.env.PDF_UPLOAD_PATH) {
    throw new Error('PDF upload directory is not configured');
  }

  return path.resolve(__dirname, '../../..', process.env.PDF_UPLOAD_PATH);
}

function resolveStoredFilePath(storageName) {
  if (typeof storageName !== 'string' || !/^[0-9a-f-]{36}\.pdf$/i.test(storageName)) {
    throw new Error('Stored document filename is invalid');
  }

  const directory = getUploadDirectory();
  const filePath = path.resolve(directory, storageName);
  if (path.dirname(filePath) !== directory) {
    throw new Error('Stored document path is invalid');
  }

  return filePath;
}

function toPublicDocument(row) {
  return {
    id: row.id,
    fileName: row.file_name,
    status: row.status,
    processingError: row.processing_error,
    summaryStatus: row.summary_status,
    summary: parseJson(row.summary_json),
    summaryError: row.summary_error,
    pageCount: row.page_count,
    chunkCount: row.chunk_count,
    uploadedAt: row.uploaded_at,
  };
}

function parseJson(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

async function hashFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function findDuplicateContent(connection, userId, storageName) {
  const newPath = resolveStoredFilePath(storageName);
  const newSize = (await fs.stat(newPath)).size;
  const [documents] = await connection.execute(
    'SELECT file_name, file_path FROM documents WHERE user_id = ? ORDER BY id ASC',
    [userId],
  );
  let newHash;
  for (const document of documents) {
    const existingPath = resolveStoredFilePath(document.file_path);
    let existingSize;
    try {
      existingSize = (await fs.stat(existingPath)).size;
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (existingSize !== newSize) continue;
    if (!newHash) newHash = await hashFile(newPath);
    if (newHash === await hashFile(existingPath)) return document.file_name;
  }
  return null;
}

async function createDocument(userId, originalName, storageName) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);

    const [duplicates] = await connection.execute(
      'SELECT id FROM documents WHERE user_id = ? AND file_name = ? LIMIT 1',
      [userId, originalName],
    );
    if (duplicates.length) {
      const error = new Error('Document with this filename already exists');
      error.code = 'DOCUMENT_EXISTS';
      throw error;
    }

    const matchingFileName = await findDuplicateContent(connection, userId, storageName);
    if (matchingFileName) {
      const error = new Error('This PDF has the same content as an existing document');
      error.code = 'DOCUMENT_CONTENT_EXISTS';
      error.existingFileName = matchingFileName;
      throw error;
    }

    const [result] = await connection.execute(
      "INSERT INTO documents (user_id, file_name, file_path, status, summary_status) VALUES (?, ?, ?, 'uploaded', 'pending')",
      [userId, originalName, storageName],
    );
    const [rows] = await connection.execute(
      `SELECT id, file_name, status, processing_error, summary_status, summary_json,
              summary_error, page_count, chunk_count, uploaded_at
       FROM documents WHERE id = ? AND user_id = ?`,
      [result.insertId, userId],
    );
    if (!rows.length) {
      throw new Error('Created document could not be read');
    }
    const document = toPublicDocument(rows[0]);
    await connection.commit();
    return document;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listDocuments(userId) {
  const [rows] = await pool.execute(
    `SELECT id, file_name, status, processing_error, summary_status, summary_json,
            summary_error, page_count, chunk_count, uploaded_at
     FROM documents WHERE user_id = ? ORDER BY uploaded_at DESC, id DESC`,
    [userId],
  );
  return rows.map(toPublicDocument);
}

async function deleteDocument(userId, documentId) {
  const { isDocumentJobActive } = require('./document.jobs');
  const connection = await pool.getConnection();
  let originalPath;
  let stagedPath;
  let committed = false;

  try {
    await connection.beginTransaction();
    await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    const [rows] = await connection.execute(
      'SELECT file_path, status, summary_status FROM documents WHERE id = ? AND user_id = ? FOR UPDATE',
      [documentId, userId],
    );
    if (!rows.length) {
      await connection.rollback();
      return false;
    }

    if (rows[0].status === 'processing' || rows[0].summary_status === 'processing'
      || isDocumentJobActive(userId, documentId)) {
      const error = new Error('Document processing is still running');
      error.code = 'DOCUMENT_BUSY';
      throw error;
    }

    originalPath = resolveStoredFilePath(rows[0].file_path);
    await deleteIndexedDocument(userId, documentId);
    stagedPath = path.join(getUploadDirectory(), `${randomUUID()}.deleting`);
    try {
      await fs.rename(originalPath, stagedPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      stagedPath = undefined;
    }

    const [result] = await connection.execute(
      'DELETE FROM documents WHERE id = ? AND user_id = ?',
      [documentId, userId],
    );
    if (result.affectedRows !== 1) {
      throw new Error('Document deletion did not affect one row');
    }
    await connection.commit();
    committed = true;
  } catch (error) {
    if (!committed) {
      await connection.rollback();
      if (stagedPath) {
        await fs.rename(stagedPath, originalPath);
      }
    }
    throw error;
  } finally {
    connection.release();
  }

  if (stagedPath) {
    await fs.rm(stagedPath, { force: true, maxRetries: 3, retryDelay: 100 });
  }
  return true;
}

async function listRecentSummaries(userId) {
  const [rows] = await pool.execute(
    `SELECT id, document_id, pdf_name, summary_json, created_at
     FROM summary_history WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 5`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    pdfName: row.pdf_name,
    summary: parseJson(row.summary_json),
    createdAt: row.created_at,
  }));
}

async function deleteSavedSummary(userId, summaryId) {
  const [result] = await pool.execute(
    'DELETE FROM summary_history WHERE id = ? AND user_id = ?',
    [summaryId, userId],
  );
  return result.affectedRows === 1;
}

module.exports = {
  getUploadDirectory, resolveStoredFilePath, createDocument, listDocuments, deleteDocument,
  listRecentSummaries, deleteSavedSummary, findDuplicateContent, hashFile,
};
