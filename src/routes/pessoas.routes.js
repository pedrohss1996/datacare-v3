const express = require('express');
const router = express.Router();
const pessoaController = require('../controllers/pessoaController');

// Formulário de Cadastro
router.get('/pessoas/nova', pessoaController.renderizarCadastro);

// Ação de Salvar (POST)
router.post('/pessoas/cadastrar', pessoaController.cadastrar);

// Listagem Simples (Placeholder para teste)
router.get('/pessoas', (req, res) => {
    const msg = req.query.sucesso ? '<div style="color:green; font-weight:bold">Cadastro realizado com sucesso!</div>' : '';
    res.send(`${msg} <h1>Módulo de Pessoas</h1><br><a href="/pessoas/nova">Cadastrar Nova Pessoa</a>`);
});

module.exports = router;