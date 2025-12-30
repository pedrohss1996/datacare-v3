// src/routes/pageBuilder.routes.js
const express = require('express');
const router = express.Router();
const pageBuilderController = require('../controllers/pageBuilderController');

// Rotas do Construtor
router.get('/page-builder', pageBuilderController.renderBuilder);
router.post('/page-builder/generate', pageBuilderController.generateCode);
router.post('/page-builder/save', pageBuilderController.savePage);

// --- ADICIONE ESTA LINHA ---
// Rota para ACESSAR a página que você criou (ex: localhost:3000/p/meu-relatorio)
router.get('/p/:slug', pageBuilderController.renderPublishedPage);

module.exports = router;