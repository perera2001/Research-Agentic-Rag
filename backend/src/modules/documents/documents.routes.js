const path = require('node:path');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../../middleware/auth.middleware');
const { getUploadDirectory } = require('./documents.service');
const { upload, list, remove } = require('./documents.controller');

const router = express.Router();
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const storage = multer.diskStorage({
  destination(_req, _file, callback) {
    let directory;
    try {
      directory = getUploadDirectory();
    } catch (error) {
      return callback(error);
    }
    fs.mkdir(directory, { recursive: true })
      .then(() => callback(null, directory))
      .catch(callback);
  },
  filename(_req, _file, callback) {
    callback(null, `${randomUUID()}.pdf`);
  },
});

const receiveFile = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 0, parts: 1 },
  fileFilter(_req, file, callback) {
    const name = file.originalname;
    if (typeof name !== 'string' || !name || name.length > 255
      || /[\\/\x00-\x1f\x7f]/.test(name)
      || path.extname(name).toLowerCase() !== '.pdf'
      || file.mimetype !== 'application/pdf') {
      const error = new Error('Only PDF files with a .pdf filename are allowed');
      error.code = 'INVALID_PDF';
      return callback(error);
    }
    callback(null, true);
  },
}).single('file');

function handleUpload(req, res, next) {
  receiveFile(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'PDF file must be 25 MB or smaller' });
    }
    if (error.code === 'INVALID_PDF') {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ error: 'Upload one PDF in the "file" field' });
    }
    next(error);
  });
}

router.use(requireAuth);
router.post('/upload', handleUpload, upload);
router.get('/', list);
router.delete('/:id', remove);

module.exports = router;
