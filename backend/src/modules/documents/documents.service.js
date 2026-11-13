const path = require('node:path');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const { pool } = require('../../config/db');

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
    summaryStatus: row.summary_status,
    pageCount: row.page_count,
    chunkCount: row.chunk_count,
    uploadedAt: row.uploaded_at,
  };
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

    const [result] = await connection.execute(
      "INSERT INTO documents (user_id, file_name, file_path, status, summary_status) VALUES (?, ?, ?, 'uploaded', 'pending')",
      [userId, originalName, storageName],
    );
    const [rows] = await connection.execute(
      `SELECT id, file_name, status, summary_status, page_count, chunk_count, uploaded_at
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
    `SELECT id, file_name, status, summary_status, page_count, chunk_count, uploaded_at
     FROM documents WHERE user_id = ? ORDER BY uploaded_at DESC, id DESC`,
    [userId],
  );
  return rows.map(toPublicDocument);
}

async function deleteDocument(userId, documentId) {
  const connection = await pool.getConnection();
  let originalPath;
  let stagedPath;
  let committed = false;

  try {
    await connection.beginTransaction();
    await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    const [rows] = await connection.execute(
      'SELECT file_path FROM documents WHERE id = ? AND user_id = ? FOR UPDATE',
      [documentId, userId],
    );
    if (!rows.length) {
      await connection.rollback();
      return false;
    }

    originalPath = resolveStoredFilePath(rows[0].file_path);
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

module.exports = { getUploadDirectory, createDocument, listDocuments, deleteDocument };
