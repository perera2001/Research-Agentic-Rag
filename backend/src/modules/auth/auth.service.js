const bcrypt = require('bcryptjs');
const { pool } = require('../../config/db');

const HASH_ROUNDS = 12;

function toPublicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
  };
}

async function registerUser({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, HASH_ROUNDS);
  const [result] = await pool.execute(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'user')",
    [name, email, passwordHash],
  );

  return { id: result.insertId, name, email, role: 'user' };
}

async function authenticateUser(email, password) {
  const [rows] = await pool.execute(
    'SELECT id, name, email, password_hash, role FROM users WHERE email = ? LIMIT 1',
    [email],
  );
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return null;
  }

  return toPublicUser(user);
}

async function getPublicUserById(id) {
  const [rows] = await pool.execute(
    'SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1',
    [id],
  );

  return rows[0] ? toPublicUser(rows[0]) : null;
}

module.exports = { registerUser, authenticateUser, getPublicUserById };
