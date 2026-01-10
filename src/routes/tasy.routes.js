const router = require('express').Router();
const tasyController = require('../controllers/tasyController'); // Confirme o caminho
const loginRequired = require('../middlewares/loginRequired');

// ... (suas outras rotas de chat, login, etc) ...

// === ROTAS DA INTEGRAÇÃO TASY ===
router.get('/api/tasy/recursos-simples/:tipoId', loginRequired, tasyController.listarRecursosPorTipo);
router.get('/api/tasy/unidades', loginRequired, tasyController.listarUnidades);
router.get('/api/tasy/especialidades/:tipoId', loginRequired, tasyController.listarEspecialidades); // Nova
router.get('/api/tasy/convenios/:especialidadeId', loginRequired, tasyController.listarConvenios); // Nova
router.get('/api/tasy/recursos', loginRequired, tasyController.listarRecursos); // Atualizada (sem :id na url, pois usa ?query)

router.post('/api/tasy/agenda', loginRequired, tasyController.listarAgenda);       // Busca Horários
router.post('/api/tasy/confirmar', loginRequired, tasyController.confirmar);       // Ações
router.post('/api/tasy/cancelar', loginRequired, tasyController.cancelar);
router.post('/api/tasy/bloquear', loginRequired, tasyController.bloquear);
router.post('/api/tasy/agendar', loginRequired, tasyController.agendarNovo);

module.exports = router;



