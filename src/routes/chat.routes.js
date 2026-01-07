const express = require('express');
const router = express.Router();
const loginRequired = require('../middlewares/loginRequired');
const chatController = require('../controllers/chatController');

// Tela Principal do Chat
router.get('/chat', loginRequired, chatController.index);

// API para buscar mensagens de um ticket específico (usaremos no AJAX)
router.get('/api/chat/mensagens/:ticketId', loginRequired, chatController.listarMensagens);

module.exports = router;