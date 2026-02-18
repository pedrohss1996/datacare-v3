// src/routes/staff.routes.js
const express = require('express');
const router = express.Router();
const loginRequired = require('../middlewares/loginRequired');
const staffController = require('../controllers/staffController');

router.get('/staff', loginRequired, staffController.index);
router.get('/staff/escalas', loginRequired, staffController.escalas);

router.get('/api/staff/colaboradores', loginRequired, staffController.listarColaboradores);
router.get('/api/staff/funcionarios', loginRequired, staffController.listarFuncionarios);
router.get('/api/staff/funcionario/:id', loginRequired, staffController.buscarFuncionario);
router.put('/api/staff/funcionario/:id', loginRequired, staffController.atualizarFuncionario);
router.delete('/api/staff/funcionario/:id', loginRequired, staffController.removerFuncionario);
router.get('/api/staff/usuarios', loginRequired, staffController.buscarUsuarios);
router.get('/api/staff/setores', loginRequired, staffController.listarSetores);
router.post('/api/staff/funcionario', loginRequired, staffController.salvarFuncionario);
router.post('/api/staff/setor', loginRequired, staffController.salvarSetor);
router.post('/api/staff/escala', loginRequired, staffController.salvarEscala);
router.get('/api/staff/escalas', loginRequired, staffController.buscarEscalas);

module.exports = router;
