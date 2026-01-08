const express = require('express');
const router = express.Router();
const pessoaController = require('../controllers/pessoaController');
const loginRequired = require('../middlewares/loginRequired'); // <--- 1. Importe o Guardião

// Rota GET: Listagem (PROTEGIDA)
// Adicionamos o 'loginRequired' antes do controller
router.get('/pessoas', loginRequired, pessoaController.listar); 

// Rota GET: Formulário (PROTEGIDA)
router.get('/pessoas/cadastro', loginRequired, pessoaController.renderizarCadastro);

// Rota POST: Salvar (PROTEGIDA)
// Importante proteger o POST também para ninguém mandar dados via Postman/Curl
router.post('/pessoas/cadastrar', loginRequired, pessoaController.cadastrar);

module.exports = router;