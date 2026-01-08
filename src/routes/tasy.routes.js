const express = require('express');
const router = express.Router();
const loginRequired = require('../middlewares/loginRequired');
const tasyController = require('../controllers/tasyController');

// Rotas de Leitura (Listagens)
router.get('/api/tasy/unidades', loginRequired, tasyController.listarUnidades);
router.get('/api/tasy/recursos/:unidadeId', loginRequired, tasyController.listarRecursos);
router.post('/api/tasy/agenda', loginRequired, tasyController.listarAgenda);

// Rotas de Ação (Botão Direito)
router.post('/api/tasy/confirmar', loginRequired, tasyController.confirmar);
router.post('/api/tasy/cancelar', loginRequired, tasyController.cancelar);
router.post('/api/tasy/bloquear', loginRequired, tasyController.bloquear);

// ✅ ROTA ATIVADA: Agendar Novo Paciente
// O frontend chama '/api/tasy/agendar', então mapeamos para a função 'agendarNovo' do controller
router.post('/api/tasy/agendar', loginRequired, tasyController.agendarNovo);

// Rota de Transferência de Agenda (Stub / Futuro)
// Pode deixar comentada ou ativa retornando erro 501 (como definimos no controller)
// router.post('/api/tasy/transferir', loginRequired, tasyController.transferir);

module.exports = router;