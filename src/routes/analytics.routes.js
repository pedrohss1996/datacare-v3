// ARQUIVO: src/routes/analytics.routes.js
const express = require('express');
const router = express.Router();

// Importa o Controller (Verifique se o nome do arquivo do controller está com C maiúsculo ou minúsculo na sua pasta)
const analyticsController = require('../controllers/AnalyticsController'); 

// --- ROTA DE RENDERIZAÇÃO DA PÁGINA ---
// GET /analytics
router.get('/analytics', analyticsController.index);

// --- ROTAS DA API (AJAX) ---
// POST /api/analytics/preview (Gera o SQL e o HTML de teste)
router.post('/api/analytics/preview', analyticsController.preview);

// POST /api/analytics/save (Salva o widget no banco Postgres)
router.post('/api/analytics/save', analyticsController.saveWidget);

router.post('/api/analytics/delete/:id', analyticsController.deleteWidget); // NOVA ROTA
module.exports = router;