const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Rota GET: Tela de Login
router.get('/login', authController.renderizarLogin);

// Rota POST: Processar Login
router.post('/login', authController.login);

// Rota GET: Logout
router.get('/logout', authController.logout);

module.exports = router;