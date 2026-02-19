// ARQUIVO: src/routes/analytics.routes.js
const express = require('express');
const router = express.Router();
const loginRequired = require('../middlewares/loginRequired');
const { biCacheMiddleware } = require('../middlewares/biCacheMiddleware');

// Importa o Controller
const analyticsController = require('../controllers/AnalyticsController'); 

// ==================================================================
// ROTAS DE VISUALIZAÇÃO (PÁGINAS)
// ==================================================================

// GET /analytics - Página principal do Analytics Builder
router.get('/analytics', loginRequired, analyticsController.index);

// GET /analytics/monitor - Monitor de performance BI
router.get('/analytics/monitor', loginRequired, (req, res) => {
    res.render('pages/analytics/monitor', { 
        title: 'Monitor BI', 
        user: req.user,
        hideFooter: true
    });
});

// GET /analytics/dashboard/:id - Visualizar dashboard salvo (página completa)
router.get('/analytics/dashboard/:id', loginRequired, analyticsController.viewWidget);

// ==================================================================
// ROTAS DA API (AJAX)
// ==================================================================

// POST /api/analytics/preview - Gera SQL e HTML preview (legado) ou JSON
router.post('/api/analytics/preview', 
    loginRequired, 
    biCacheMiddleware({ ttl: 900, enable: true }), 
    analyticsController.preview
);

// POST /api/analytics/layout - IA retorna apenas JSON de config (para uso com cache)
router.post('/api/analytics/layout', loginRequired, analyticsController.layout);

// POST /api/analytics/async-dashboard - Orquestrador assíncrono (Promise.all quando há cache)
router.post('/api/analytics/async-dashboard', loginRequired, analyticsController.asyncDashboard);

// POST /api/analytics/stream-dashboard - Streaming NDJSON (oracledb.queryStream, memória constante)
router.post('/api/analytics/stream-dashboard', loginRequired, analyticsController.streamDashboard);

// POST /api/analytics/init - Modo JSON rápido (~2s). Retorna biConfig + rawResult.
router.post('/api/analytics/init', loginRequired, analyticsController.init);

// POST /api/analytics/generate-page - Gera HTML completo (estilo Dashboard Pendências)
router.post('/api/analytics/generate-page', loginRequired, analyticsController.generatePage);

// POST /api/analytics/data/:queryId - Endpoint para substituir requestQuery (compatibilidade AppMed)
// Aceita parâmetros dinâmicos e executa query SQL salva
router.post('/api/analytics/data/:queryId', loginRequired, analyticsController.fetchQueryData);

// POST /api/analytics/stream-progressive - Streaming progressivo para grandes datasets
router.post('/api/analytics/stream-progressive', loginRequired, analyticsController.streamProgressive);

// POST /api/analytics/save - Salva widget/dashboard no PostgreSQL (exige pasta)
router.post('/api/analytics/save', loginRequired, analyticsController.saveWidget);

// POST /api/analytics/save-query - Salva APENAS query SQL (SEM pasta)
router.post('/api/analytics/save-query', loginRequired, analyticsController.saveQueryOnly);

// POST /api/analytics/delete/:id - Desativa widget/dashboard OU deleta query
router.post('/api/analytics/delete/:id', loginRequired, analyticsController.deleteWidget);

// POST /api/analytics/delete-query/:id - Deleta query salva
router.post('/api/analytics/delete-query/:id', loginRequired, analyticsController.deleteQuery);

// GET /api/analytics/view/:id - Visualizar dashboard (HTML puro - sem layout)
router.get('/api/analytics/view/:id', analyticsController.viewWidget);

// GET /api/analytics/export/:id - Exportar dashboard (futuro)
router.get('/api/analytics/export/:id', loginRequired, analyticsController.exportDashboard);

// GET /api/analytics/templates - Lista templates pré-definidos
router.get('/api/analytics/templates', loginRequired, analyticsController.getTemplates);

// POST /api/analytics/apply-template - Aplica template
// Cache de 10 minutos para templates aplicados
router.post('/api/analytics/apply-template', 
    loginRequired, 
    biCacheMiddleware({ ttl: 600, enable: true }), 
    analyticsController.applyTemplate
);

// ==================================================================
// ROTAS DE ADMINISTRAÇÃO DO CACHE E PERFORMANCE
// ==================================================================

const { getCacheStats, invalidateAllBICache } = require('../middlewares/biCacheMiddleware');
const performanceMonitor = require('../utils/performanceMonitor');

// GET /api/analytics/cache/stats - Estatísticas do cache
router.get('/api/analytics/cache/stats', loginRequired, async (req, res) => {
    try {
        const stats = await getCacheStats();
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/analytics/cache/clear - Limpa todo o cache BI
router.post('/api/analytics/cache/clear', loginRequired, async (req, res) => {
    try {
        await invalidateAllBICache();
        res.json({ success: true, message: 'Cache BI limpo com sucesso' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/analytics/performance/stats - Estatísticas de performance
router.get('/api/analytics/performance/stats', loginRequired, (req, res) => {
    try {
        const stats = performanceMonitor.getStats();
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/analytics/performance/report - Relatório completo de performance
router.get('/api/analytics/performance/report', loginRequired, (req, res) => {
    try {
        const report = performanceMonitor.getReport();
        res.json({ success: true, report });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/analytics/performance/slow-queries - Queries lentas
router.get('/api/analytics/performance/slow-queries', loginRequired, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const slowQueries = performanceMonitor.getSlowQueries(limit);
        res.json({ success: true, slowQueries });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/analytics/performance/clear - Limpa histórico de performance
router.post('/api/analytics/performance/clear', loginRequired, (req, res) => {
    try {
        performanceMonitor.clearHistory();
        res.json({ success: true, message: 'Histórico de performance limpo' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =========================================================================
// CACHE DE DASHBOARDS
// =========================================================================

// POST /api/analytics/cache/clear - Limpa todo o cache de dashboards
router.post('/api/analytics/cache/clear', loginRequired, (req, res) => {
    try {
        const cacheDashboards = require('../utils/cacheDashboards');
        cacheDashboards.clear();
        res.json({ success: true, message: 'Cache de dashboards limpo com sucesso' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/analytics/cache/invalidate/:id - Invalida cache de um dashboard específico
router.post('/api/analytics/cache/invalidate/:id', loginRequired, (req, res) => {
    try {
        const { id } = req.params;
        const cacheDashboards = require('../utils/cacheDashboards');
        const deleted = cacheDashboards.invalidate(id);
        
        if (deleted) {
            res.json({ success: true, message: `Cache do dashboard ${id} invalidado` });
        } else {
            res.json({ success: false, message: `Dashboard ${id} não estava em cache` });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/analytics/cache/stats - Estatísticas do cache
router.get('/api/analytics/cache/stats', loginRequired, (req, res) => {
    try {
        const cacheDashboards = require('../utils/cacheDashboards');
        const stats = cacheDashboards.getStats();
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;