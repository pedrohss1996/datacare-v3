// ARQUIVO: src/routes/analytics.routes.js
const express = require('express');
const router = express.Router();
const loginRequired = require('../middlewares/loginRequired');

// Importa o Controller
const analyticsController = require('../controllers/AnalyticsController'); 

// ==================================================================
// ROTAS DE VISUALIZAÇÃO (PÁGINAS)
// ==================================================================

// GET /analytics - Página principal do Analytics Builder
router.get('/analytics', loginRequired, analyticsController.index);

// GET /analytics/lista - Listagem de todos os dashboards
router.get('/analytics/lista', loginRequired, analyticsController.listaDashboards);

// GET /analytics/dashboard/:id - Visualizar dashboard salvo (página completa)
router.get('/analytics/dashboard/:id', loginRequired, analyticsController.viewWidget);

// ==================================================================
// ROTAS DA API (AJAX)
// ==================================================================

// POST /api/analytics/preview - Gera SQL e HTML preview
router.post('/api/analytics/preview', loginRequired, analyticsController.preview);

// POST /api/analytics/save - Salva widget no PostgreSQL
router.post('/api/analytics/save', loginRequired, analyticsController.saveWidget);

// POST /api/analytics/delete/:id - Desativa widget (usando POST ao invés de DELETE)
router.post('/api/analytics/delete/:id', loginRequired, analyticsController.deleteWidget);

// GET /api/analytics/view/:id - Visualizar dashboard (HTML puro - sem layout)
router.get('/api/analytics/view/:id', analyticsController.viewWidget);

// GET /api/analytics/export/:id - Exportar dashboard (futuro)
router.get('/api/analytics/export/:id', loginRequired, analyticsController.exportDashboard);

// GET /api/analytics/templates - Lista templates pré-definidos
router.get('/api/analytics/templates', loginRequired, analyticsController.getTemplates);

// POST /api/analytics/apply-template - Aplica template
router.post('/api/analytics/apply-template', loginRequired, analyticsController.applyTemplate);

module.exports = router;