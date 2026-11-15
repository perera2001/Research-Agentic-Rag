const { listUsers, deleteUser } = require('./users.service');

async function list(_req, res) {
  res.json({ users: await listUsers() });
}

async function deleteAccount(userId, res) {
  try {
    if (!await deleteUser(userId)) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ message: 'User deleted' });
  } catch (error) {
    if (error.code === 'DOCUMENT_BUSY' || error.code === 'USER_DOCUMENTS_REMAIN') {
      return res.status(409).json({ error: error.message });
    }
    if (error.code === 'AI_SERVICE_UNAVAILABLE') {
      return res.status(502).json({ error: 'Could not remove the user’s documents from the AI index' });
    }
    throw error;
  }
}

async function remove(req, res) {
  const userId = Number(req.params.id);
  if (!Number.isSafeInteger(userId) || userId < 1) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  if (userId === req.user.id) {
    return res.status(403).json({ error: 'You cannot delete your own account' });
  }
  return deleteAccount(userId, res);
}

async function removeOwnAccount(req, res) {
  if (req.user.role !== 'user') {
    return res.status(403).json({ error: 'Admin accounts cannot be deleted here' });
  }
  return deleteAccount(req.user.id, res);
}

module.exports = { list, remove, removeOwnAccount };
