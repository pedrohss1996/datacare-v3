const router = require('express').Router();
const tasyController = require('../controllers/tasyController'); 
const loginRequired = require('../middlewares/loginRequired');

// ==================================================================
// 1. ROTAS DE DROPDOWNS E LISTAGEM
// ==================================================================

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


// ==================================================================
// 2. ROTA DE CONSULTA DA AGENDA E ATIVOS
// ==================================================================

// Busca os pacientes de amanhã para confirmar (Aba "Ativos")
router.get('/api/tasy/ativos', loginRequired, tasyController.listarContatosAtivos);

// Busca a grade de horários (Grid principal)
router.post('/api/tasy/agenda', loginRequired, tasyController.listarAgenda);


// ==================================================================
// 3. ROTAS DE AÇÃO RÁPIDA (Menu de Contexto)
// ==================================================================
router.post('/api/tasy/confirmar', loginRequired, tasyController.confirmar);
router.post('/api/tasy/cancelar', loginRequired, tasyController.cancelar);
router.post('/api/tasy/bloquear', loginRequired, tasyController.bloquear);
// Esta rota 'agendar' antiga pode ser mantida ou substituída pela nova lógica abaixo, dependendo do seu uso
router.post('/api/tasy/agendar', loginRequired, tasyController.agendarNovo); 
router.post('/api/tasy/transferir', loginRequired, tasyController.transferir);


// ==================================================================
// 4. [NOVO] GESTÃO DE PACIENTES E AGENDAMENTO COMPLETO
// ==================================================================

// Busca de Pacientes (Autocomplete)
// IMPORTANTE: Esta rota deve vir ANTES de /pacientes/:id para não confundir "buscar" com um ID
router.get('/api/tasy/pacientes/buscar', loginRequired, tasyController.buscarPacientes);

// Detalhes do Paciente (Para preencher o modal de edição/cadastro)
router.get('/api/tasy/pacientes/:id', loginRequired, tasyController.getDetalhesPaciente);

// Salvar ou Atualizar Paciente (Upsert via PL/SQL)
router.post('/api/tasy/pacientes/salvar', loginRequired, tasyController.salvarPaciente);

// Confirmar Agendamento (Lógica robusta que diferencia Consulta/Exame)
router.post('/api/tasy/agendar/confirmar', loginRequired, tasyController.confirmarAgendamento);

// Detalhes completos do agendamento (Para modal mais_dados)
router.get('/api/tasy/agenda/:id/detalhes', loginRequired, tasyController.getDetalhesAgendamento);

module.exports = router;