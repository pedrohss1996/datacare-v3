// ARQUIVO: src/routes/indicadores.routes.js
const express = require('express');
const router = express.Router();
const indicadoresController = require('../controllers/indicadoresController');

router.get('/indicadores', indicadoresController.dashboard);
router.get('/api/indicadores/:id/dados', indicadoresController.obterDados);

module.exports = router;