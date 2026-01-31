const express = require('express');
const router = express.Router();
const pessoaController = require('../controllers/pessoaController');
const loginRequired = require('../middlewares/loginRequired');

// Rota principal - listagem de usuários
router.get('/pessoas', loginRequired, pessoaController.index);

// Formulário de criação
router.get('/pessoas/novo', loginRequired, pessoaController.renderizarCadastro);

// Formulário de edição
router.get('/pessoas/editar/:id', loginRequired, pessoaController.renderizarEdicao);

// Criar usuário
router.post('/pessoas/cadastrar', loginRequired, pessoaController.cadastrar);

// Atualizar usuário
router.post('/pessoas/atualizar/:id', loginRequired, pessoaController.atualizar);

// Excluir usuário (soft delete)
router.delete('/pessoas/excluir/:id', loginRequired, pessoaController.excluir);

// API: Buscar usuário por ID
router.get('/api/pessoas/:id', loginRequired, pessoaController.buscarPorId);

module.exports = router;