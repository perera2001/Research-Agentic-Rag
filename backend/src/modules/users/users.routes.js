const express = require('express');
const { requireAuth, requireAdmin } = require('../../middleware/auth.middleware');
const { list, remove, removeOwnAccount } = require('./users.controller');

const router = express.Router();
router.use(requireAuth);
router.delete('/me', removeOwnAccount);
router.use(requireAdmin);
router.get('/', list);
router.delete('/:id', remove);

module.exports = router;
