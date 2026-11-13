const jwt = require('jsonwebtoken');
const { registerUser, authenticateUser } = require('./auth.service');

function createToken(user) {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN;

  if (!secret || !expiresIn) {
    throw new Error('JWT configuration is incomplete');
  }

  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    secret,
    { algorithm: 'HS256', expiresIn },
  );
}

async function register(req, res) {
  const { name, email, password } = req.body || {};
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalizedName || normalizedName.length > 255) {
    return res.status(400).json({ error: 'Name must be 1 to 255 characters' });
  }
  if (normalizedEmail.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Password must be at least 8 characters and at most 72 bytes' });
  }

  try {
    const user = await registerUser({ name: normalizedName, email: normalizedEmail, password });
    return res.status(201).json({ token: createToken(user), user });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw error;
  }
}

async function login(req, res) {
  const { email, password } = req.body || {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalizedEmail || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = Buffer.byteLength(password, 'utf8') <= 72
    ? await authenticateUser(normalizedEmail, password)
    : null;

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  return res.json({ token: createToken(user), user });
}

function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { register, login, me };
