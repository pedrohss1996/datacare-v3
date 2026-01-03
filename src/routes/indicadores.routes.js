// src/routes/indicadores.routes.js
const express = require('express');
const router = express.Router();
const indicadoresController = require('../controllers/indicadoresController'); 
const loginRequired = require('../middlewares/loginRequired');

// ==========================================================
// ÁREA ADMINISTRATIVA (CRUD)
// Importante: Estas rotas devem vir ANTES da rota dinâmica
// ==========================================================

// 1. Formulário para criar novo indicador
router.get('/indicadores/novo', loginRequired, indicadoresController.criar);

// 2. Salvar o novo indicador (POST do formulário)
router.post('/indicadores/salvar', loginRequired, indicadoresController.salvar);

// 3. Formulário de Edição (Pelo ID numérico, para não confundir com o slug)
router.get('/indicadores/editar/:id', loginRequired, indicadoresController.editar);

// 4. Atualizar indicador existente
router.post('/indicadores/atualizar/:id', loginRequired, indicadoresController.atualizar);

// 5. Excluir indicador
router.post('/indicadores/excluir/:id', loginRequired, indicadoresController.excluir);


// ==========================================================
// ÁREA PÚBLICA / VISUALIZAÇÃO
// ==========================================================

// --- ROTA DE LISTAGEM (O Menu) ---
router.get('/indicadores', loginRequired, indicadoresController.listar);

// --- ROTA DE VISUALIZAÇÃO (O Gráfico) ---
// O ":nome_indicador" é dinâmico. Tudo que não casou acima, cai aqui.
router.get('/indicadores/:nome_indicador', loginRequired, indicadoresController.visualizar);

module.exports = router;