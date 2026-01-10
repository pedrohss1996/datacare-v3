const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const loginRequired = require('../middlewares/loginRequired');

// =================================================================
// 🔓 ROTAS PÚBLICAS (Acesso Livre / Robôs)
// =================================================================

// 🚀 WEBHOOK Z-API
// IMPORTANTE: Não coloque loginRequired aqui, senão a Z-API toma erro 401.
router.post('/api/webhook/zapi', chatController.webhook);

// Rota de Simulação (Útil para testes, manter pública por enquanto)
router.post('/api/teste/novo-paciente', chatController.simularEntradaPaciente);


// =================================================================
// 🔒 ROTAS PROTEGIDAS (Requer Login)
// =================================================================

// 1. View (Tela)
router.get('/chat', loginRequired, chatController.index);

// 2. APIs de Chat (Ações do Atendente)
router.get('/api/chat/mensagens/:ticketId', loginRequired, chatController.listarMensagens);
router.post('/api/chat/assumir', loginRequired, chatController.assumir);
router.post('/api/chat/enviar', loginRequired, chatController.enviar);
router.post('/api/chat/transferir', loginRequired, chatController.transferir);
router.post('/api/chat/finalizar', loginRequired, chatController.finalizar);

module.exports = router;