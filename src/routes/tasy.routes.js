const router = require('express').Router();
const tasyController = require('../controllers/tasyController'); 
const loginRequired = require('../middlewares/loginRequired');

// ... (seus outros imports ou rotas de chat/login, se houver neste arquivo) ...

// === 1. ROTAS DE DROPDOWNS E LISTAGEM ===

// Unidades (Tipos de Agenda)
router.get('/api/tasy/unidades', loginRequired, tasyController.listarUnidades);

// Especialidades (Precisa do ID do Tipo na URL)
router.get('/api/tasy/especialidades/:tipoId', loginRequired, tasyController.listarEspecialidades);

// Convênios 
router.get('/api/tasy/convenios', loginRequired, tasyController.listarConvenios); 

// Recursos (Médicos/Salas)
router.get('/api/tasy/recursos', loginRequired, tasyController.listarRecursos); 

// Orientação
router.get('/api/tasy/orientacao', loginRequired, tasyController.obterOrientacao);

// === NOVA ROTA: Contatos Ativos (Aba "Ativos") ===
// Essa rota busca os pacientes de amanhã para confirmar
router.get('/api/tasy/ativos', loginRequired, tasyController.listarContatosAtivos);


// === 2. ROTA DE CONSULTA DA AGENDA (GRID) ===
router.post('/api/tasy/agenda', loginRequired, tasyController.listarAgenda);


// === 3. ROTAS DE AÇÃO (POST) ===
router.post('/api/tasy/confirmar', loginRequired, tasyController.confirmar);
router.post('/api/tasy/cancelar', loginRequired, tasyController.cancelar);
router.post('/api/tasy/bloquear', loginRequired, tasyController.bloquear);
router.post('/api/tasy/agendar', loginRequired, tasyController.agendarNovo);
router.post('/api/tasy/transferir', loginRequired, tasyController.transferir);

module.exports = router;