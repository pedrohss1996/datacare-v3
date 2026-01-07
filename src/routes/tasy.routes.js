const express = require('express');
const router = express.Router();
const loginRequired = require('../middlewares/loginRequired');
const tasyController = require('../controllers/tasyController');

router.get('/api/tasy/unidades', loginRequired, tasyController.listarUnidades);
router.get('/api/tasy/recursos/:unidadeId', loginRequired, tasyController.listarRecursos);
router.post('/api/tasy/agenda', loginRequired, tasyController.listarAgenda);
//router.post('/api/tasy/agendar', loginRequired, tasyController.agendar);
router.post('/api/tasy/confirmar', loginRequired, tasyController.confirmar);
router.post('/api/tasy/cancelar', loginRequired, tasyController.cancelar);
router.post('/api/tasy/bloquear', loginRequired, tasyController.bloquear);
// router.post('/api/tasy/transferir', loginRequired, tasyController.transferir);

module.exports = router;