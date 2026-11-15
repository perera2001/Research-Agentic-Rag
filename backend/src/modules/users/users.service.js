const { pool } = require('../../config/db');
const { deleteDocument } = require('../documents/documents.service');

async function listUsers() {
  const [rows] = await pool.execute(
    `SELECT u.id, u.name, u.email, u.role, u.created_at,
            COUNT(d.id) AS document_count
     FROM users u
     LEFT JOIN documents d ON d.user_id = u.id
     GROUP BY u.id, u.name, u.email, u.role, u.created_at
     ORDER BY u.created_at DESC, u.id DESC`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    documentCount: Number(row.document_count),
  }));
}

async function deleteUser(userId) {
  const [users] = await pool.execute('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!users.length) return false;

  const [documents] = await pool.execute(
    'SELECT id FROM documents WHERE user_id = ? ORDER BY id ASC',
    [userId],
  );
  for (const document of documents) {
    await deleteDocument(userId, document.id);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [lockedUsers] = await connection.execute(
      'SELECT id FROM users WHERE id = ? FOR UPDATE',
      [userId],
    );
    if (!lockedUsers.length) {
      await connection.rollback();
      return false;
    }
    const [remaining] = await connection.execute(
      'SELECT id FROM documents WHERE user_id = ? LIMIT 1',
      [userId],
    );
    if (remaining.length) {
      const error = new Error('New documents were added during deletion. Please try again.');
      error.code = 'USER_DOCUMENTS_REMAIN';
      throw error;
    }
    await connection.execute('DELETE FROM users WHERE id = ?', [userId]);
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { listUsers, deleteUser };
