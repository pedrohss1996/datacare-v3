/**
 * Rotas Smart - Abertura de Atendimento Zero Toque.
 * GET  /smart                      -> página de upload e conferência (EJS)
 * POST /api/atendimentos/upload-guia -> upload da imagem e retorno do DTO (JSON)
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const loginRequired = require('../middlewares/loginRequired');
const guiaController = require('../controllers/guiaController');

const router = express.Router();

const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'guias');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `guia-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif/i;
    const ext = path.extname(file.originalname).slice(1) || (file.mimetype || '').split('/')[1];
    if (allowed.test(ext) || (file.mimetype && /image\/(jpeg|jpg|png|gif)/.test(file.mimetype))) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens (JPG, PNG) são permitidas.'));
    }
  },
});

router.get('/smart', loginRequired, guiaController.index);
router.post(
  '/api/atendimentos/upload-guia',
  loginRequired,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, error: err.message || 'Erro no upload.' });
      }
      next();
    });
  },
  guiaController.uploadGuia
);

module.exports = router;
