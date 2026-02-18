/**
 * Rotas do Gerenciador de Metadados de Queries
 * API para catalogar funções do hospital (Engine IA)
 */
const express = require('express');
const router = express.Router();
const loginRequired = require('../middlewares/loginRequired');
const QueryMetadadosController = require('../controllers/QueryMetadadosController');

// Todas as rotas exigem login
router.use(loginRequired);

// Listagem e dicionário
router.get('/api/query-metadados', QueryMetadadosController.listar);
router.get('/api/query-metadados/dicionario', QueryMetadadosController.dicionario);

// Busca por query_cod (usado pelo handler requestQuery)
router.get('/api/query-metadados/cod/:queryCod', QueryMetadadosController.buscarPorCod);

// CRUD
router.get('/api/query-metadados/:id', QueryMetadadosController.buscarPorId);
router.post('/api/query-metadados', QueryMetadadosController.criar);
router.put('/api/query-metadados/:id', QueryMetadadosController.atualizar);
router.delete('/api/query-metadados/:id', QueryMetadadosController.desativar);

module.exports = router;
