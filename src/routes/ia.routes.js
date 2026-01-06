// src/routes/ia.routes.js
const express = require('express');
const router = express.Router();
const iaController = require('../controllers/iaBuilderController');
const loginRequired = require('../middlewares/loginRequired');

// Tela Principal
router.get('/ia-builder', loginRequired, iaController.index);

// Ação de Gerar (API interna chamada pelo Frontend)
router.post('/ia-builder/gerar', loginRequired, iaController.gerar);

// --- NOVA ROTA PARA EXECUTAR O SQL ---
router.post('/ia-builder/testar', loginRequired, iaController.testar);

module.exports = router;