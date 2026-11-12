const express = require('express');
const { requireAuth } = require('../../middleware/auth.middleware');
const { send, list, read, remove } = require('./chat.controller');

const router = express.Router();

router.use(requireAuth);
router.post('/', send);
router.get('/sessions', list);
router.get('/sessions/:sessionId', read);
router.delete('/sessions/:sessionId', remove);

module.exports = router;
