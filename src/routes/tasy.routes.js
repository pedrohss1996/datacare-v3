const express = require('express');
const router = express.Router();
const loginRequired = require('../middlewares/loginRequired');
const tasyController = require('../controllers/tasyController');

router.get('/api/tasy/unidades', loginRequired, tasyController.listarUnidades);
router.get('/api/tasy/recursos/:unidadeId', loginRequired, tasyController.listarRecursos);
router.post('/api/tasy/agenda', loginRequired, tasyController.listarAgenda);

module.exports = router;