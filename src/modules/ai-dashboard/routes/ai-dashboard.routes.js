/**
 * Rotas do módulo ai-dashboard - prefixo /ai-dashboard
 * Todas protegidas por loginRequired.
 */
const express = require('express');
const loginRequired = require('../../../middlewares/loginRequired');
const oracleController = require('../oracle/oracle.controller');
const datasetController = require('../datasets/dataset.controller');
const dashboardsController = require('../dashboards/dashboards.controller');
const colorScalesController = require('../color-scales/color-scales.controller');
const pagesController = require('../pages/pages.controller');

const router = express.Router();

router.use(loginRequired);

// --- Páginas (views) ---
router.get('/ai-datasets', pagesController.aiDatasetsPage);
router.get('/ai-dashboards', pagesController.aiDashboardsPage);
router.get('/ai-dashboard/:id', pagesController.aiDashboardViewPage);
router.get('/ai-color-scales', pagesController.aiColorScalesPage);

// --- Oracle connections ---
router.get('/api/ai-dashboard/connections', oracleController.list);
router.post('/api/ai-dashboard/connections', oracleController.create);
router.put('/api/ai-dashboard/connections/:id', oracleController.update);
router.delete('/api/ai-dashboard/connections/:id', oracleController.remove);
router.post('/api/ai-dashboard/connections/:id/test', oracleController.test);

// --- Datasets ---
router.get('/api/ai-dashboard/datasets', datasetController.list);
router.post('/api/ai-dashboard/datasets', datasetController.create);
router.post('/api/ai-dashboard/datasets/preview', datasetController.previewAdHoc);
router.put('/api/ai-dashboard/datasets/:id', datasetController.update);
router.delete('/api/ai-dashboard/datasets/:id', datasetController.remove);
router.get('/api/ai-dashboard/datasets/:id', datasetController.getById);
router.get('/api/ai-dashboard/datasets/:id/data', datasetController.getData);
router.get('/api/ai-dashboard/datasets/:id/default-config', dashboardsController.getDefaultConfig);
router.get('/api/ai-dashboard/datasets/:id/default-html', dashboardsController.getDefaultHtml);
router.get('/api/ai-dashboard/datasets/:id/preview', datasetController.previewById);
router.post('/api/ai-dashboard/datasets/:id/execute', datasetController.execute);

// --- Dashboards ---
router.get('/api/ai-dashboard/dashboards', dashboardsController.list);
router.post('/api/ai-dashboard/dashboards', dashboardsController.create);
router.put('/api/ai-dashboard/dashboards/:id', dashboardsController.update);
router.delete('/api/ai-dashboard/dashboards/:id', dashboardsController.remove);
router.get('/api/ai-dashboard/dashboards/:id', dashboardsController.getById);
router.get('/api/ai-dashboard/dashboards/:id/data', dashboardsController.getData);
router.post('/api/ai-dashboard/chat', dashboardsController.chat);

// --- Escalas de cor ---
router.get('/api/ai-dashboard/color-scales', colorScalesController.list);
router.post('/api/ai-dashboard/color-scales', colorScalesController.create);
router.put('/api/ai-dashboard/color-scales/:id', colorScalesController.update);
router.delete('/api/ai-dashboard/color-scales/:id', colorScalesController.remove);
router.get('/api/ai-dashboard/color-scales/:id', colorScalesController.getById);

module.exports = router;
