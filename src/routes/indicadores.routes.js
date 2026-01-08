// src/routes/indicadores.routes.js
const express = require('express');
const router = express.Router();
const indicadoresController = require('../controllers/indicadoresController'); 
const loginRequired = require('../middlewares/loginRequired');

// ==========================================================
// ÁREA ADMINISTRATIVA (CRUD)
// Mantemos idêntico, pois a gestão continua igual
// ==========================================================


// 0. Gerenciar Indicador
router.get('/indicadores/gerenciar', loginRequired, indicadoresController.gerenciar); // <--- NOVA

// 1. Formulário para criar novo indicador
router.get('/indicadores/novo', loginRequired, indicadoresController.criar);

// 2. Salvar o novo indicador (POST do formulário)
router.post('/indicadores/salvar', loginRequired, indicadoresController.salvar);

// 3. Formulário de Edição
router.get('/indicadores/editar/:id', loginRequired, indicadoresController.editar);

// 4. Atualizar indicador existente
router.post('/indicadores/atualizar/:id', loginRequired, indicadoresController.atualizar);

// 5. Excluir indicador
router.post('/indicadores/excluir/:id', loginRequired, indicadoresController.excluir);

// 6. Gerenciar Indicador
router.get('/indicadores/gerenciar', loginRequired, indicadoresController.gerenciar); // <--- NOVA


// ==========================================================
// NOVA ÁREA DE VISUALIZAÇÃO (PASTAS & DASHBOARD)
// ==========================================================

// 1. TELA PRINCIPAL (DASHBOARD)
// Carrega a view com as pastas que o usuário tem permissão
router.get('/indicadores/visualizar', loginRequired, indicadoresController.visualizacao);

// Atalho: Se o usuário acessar só '/indicadores', manda ele para a visualização
router.get('/indicadores', loginRequired, (req, res) => res.redirect('/indicadores/visualizar'));


// ==========================================================
// APIS INTERNAS (CONSUMIDAS PELO JAVASCRIPT DO FRONT)
// ==========================================================

// 2. LISTAR ITENS DA PASTA
// O JS chama isso quando o usuário clica numa pasta
router.get('/indicadores/api/pasta/:pastaId', loginRequired, indicadoresController.getIndicadoresDaPasta);

// 3. PEGAR DADOS DO GRÁFICO
// O JS chama isso quando o usuário clica num indicador
router.get('/indicadores/api/dados/:id', loginRequired, indicadoresController.getDadosIndicador);

module.exports = router;