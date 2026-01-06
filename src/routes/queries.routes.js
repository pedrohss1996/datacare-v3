const express = require('express');
const router = express.Router();
const queriesController = require('../controllers/queriesController');
const loginRequired = require('../middlewares/loginRequired');

router.get('/queries/gerenciar', loginRequired, queriesController.index);
router.get('/queries/buscar/:id', loginRequired, queriesController.buscar);
router.post('/queries/salvar', loginRequired, queriesController.salvar);
router.post('/queries/excluir/:id', loginRequired, queriesController.excluir);

module.exports = router;