const express = require('express');
const router = express.Router();
const loginRequired = require('../middlewares/loginRequired');
const tasyController = require('../controllers/tasyController');

router.get('/api/tasy/unidades', loginRequired, tasyController.listarUnidades);
router.get('/api/tasy/recursos/:unidadeId', loginRequired, tasyController.listarRecursos);
router.post('/api/tasy/agenda', loginRequired, tasyController.listarAgenda);
router.post('/api/tasy/confirmar', loginRequired, tasyController.confirmar);
router.post('/api/tasy/cancelar', loginRequired, tasyController.cancelar);
router.post('/api/tasy/bloquear', loginRequired, tasyController.bloquear);

// --- COMENTE AS LINHAS ABAIXO (ADICIONE // NO INÍCIO) ---
// router.post('/api/tasy/transferir', loginRequired, tasyController.transferir);
// router.post('/api/tasy/agendar-novo', loginRequired, tasyController.agendarNovo);

module.exports = router;