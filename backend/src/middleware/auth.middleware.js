const jwt = require('jsonwebtoken');
const { getPublicUserById } = require('../modules/auth/auth.service');

async function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);

  if (!match || !process.env.JWT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let payload;
  try {
    payload = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (_error) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!payload || typeof payload !== 'object' || !Number.isSafeInteger(payload.id) || payload.id < 1
    || typeof payload.email !== 'string' || typeof payload.role !== 'string') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await getPublicUserById(payload.id);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.user = user;
  next();
}

module.exports = { requireAuth };
