// src/routes/consultorios.routes.js

const express = require('express');
const router = express.Router();
const consultoriosController = require('../controllers/consultoriosController');
const loginRequired = require('../middlewares/loginRequired');

// Rota principal - Dashboard de consultórios
router.get('/consultorios', loginRequired, consultoriosController.index);

// Rota para agenda de consultas
router.get('/consultorios/agenda', loginRequired, consultoriosController.agenda);

// Rota para prontuários
router.get('/consultorios/prontuarios', loginRequired, consultoriosController.prontuarios);

// Rotas para atendimento (com e sem ID do paciente)
router.get('/consultorios/atendimento', loginRequired, consultoriosController.atendimento);
router.get('/consultorios/atendimento/:pacienteId', loginRequired, consultoriosController.atendimento);

// API para buscar consultas da agenda
router.get('/api/consultorios/agenda/consultas', loginRequired, consultoriosController.buscarConsultas);

// Rota para visualizar prontuário de um paciente
router.get('/consultorios/prontuario', loginRequired, consultoriosController.visualizarProntuario);

// API para buscar dados do prontuário
router.get('/api/consultorios/prontuario/:cd_pessoa_fisica', loginRequired, consultoriosController.buscarProntuario);

// API para criar nova evolução
router.post('/api/consultorios/prontuario/evolucao', loginRequired, consultoriosController.criarEvolucao);

module.exports = router;
