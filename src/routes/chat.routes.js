const express = require('express');
const router = express.Router();
const loginRequired = require('../middlewares/loginRequired');
const chatController = require('../controllers/chatController');

// Tela Principal do Chat
router.get('/chat', loginRequired, chatController.index);

// API para buscar mensagens de um ticket específico
router.get('/api/chat/mensagens/:ticketId', loginRequired, chatController.listarMensagens);

// API para finalizar atendimento
router.post('/api/chat/finalizar', loginRequired, chatController.finalizar);

// ✅ NOVA ROTA: API para Transferir (Transbordo)
// Conecta com a função 'transferir' que acabamos de criar no Controller
router.post('/api/chat/transferir', loginRequired, chatController.transferir);

// Remova o loginRequired apenas desta linha de teste
router.post('/api/teste/novo-paciente', chatController.simularEntradaPaciente);



module.exports = router;