// src/routes/index.routes.js
const express = require('express');
const router = express.Router();
const loginRequired = require('../middlewares/loginRequired');
const indicadoresController = require('../controllers/indicadoresController');

// Tela principal: Visualizar Indicadores (mesmo módulo do Data Analytics)
router.get('/', loginRequired, indicadoresController.visualizacao);

module.exports = router;