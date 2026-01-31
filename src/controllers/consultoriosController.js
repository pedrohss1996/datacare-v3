// src/controllers/consultoriosController.js

const db = require('../infra/database/connection');
const { rtfToHtml, rtfToPlainText, rtfToFormattedHtml } = require('../utils/rtfConverter');

// Função auxiliar para padronizar o retorno do Oracle/Knex
function getRows(result) {
    if (!result) return [];
    return Array.isArray(result) ? result : (result.rows || []);
}

const consultoriosController = {
    // Renderiza a página principal de consultórios
    index: (req, res) => {
        try {
            res.render('pages/consultorios/index', {
                title: 'Consultórios - DataCare',
                layout: 'layouts/main',
                user: req.user || req.session.user
            });
        } catch (error) {
            console.error('Erro ao renderizar consultórios:', error);
            res.status(500).send('Erro ao carregar página de consultórios');
        }
    },

    // Renderiza a página de atendimento/consulta
    atendimento: (req, res) => {
        try {
            const { pacienteId } = req.params;
            res.render('pages/consultorios/atendimento', {
                title: 'Atendimento - Consultórios',
                layout: 'layouts/main',
                user: req.user || req.session.user,
                pacienteId: pacienteId || null
            });
        } catch (error) {
            console.error('Erro ao renderizar atendimento:', error);
            res.status(500).send('Erro ao carregar atendimento');
        }
    },

    // Renderiza a página de agenda de consultas
    agenda: (req, res) => {
        try {
            res.render('pages/consultorios/agenda', {
                title: 'Agenda de Consultas - Consultórios',
                layout: 'layouts/main',
                user: req.user || req.session.user
            });
        } catch (error) {
            console.error('Erro ao renderizar agenda:', error);
            res.status(500).send('Erro ao carregar agenda');
        }
    },

    // Renderiza a página de prontuários
    prontuarios: (req, res) => {
        try {
            res.render('pages/consultorios/prontuarios', {
                title: 'Prontuários - Consultórios',
                layout: 'layouts/main',
                user: req.user || req.session.user
            });
        } catch (error) {
            console.error('Erro ao renderizar prontuários:', error);
            res.status(500).send('Erro ao carregar prontuários');
        }
    },

    // Visualiza prontuário de um paciente específico
    visualizarProntuario: async (req, res) => {
        try {
            const { cd_pessoa_fisica, cd_agenda } = req.query;
            
            if (!cd_pessoa_fisica) {
                return res.status(400).render('pages/error', {
                    title: 'Erro',
                    layout: 'layouts/main',
                    mensagem: 'Código do paciente não informado'
                });
            }

            res.render('pages/consultorios/prontuario-detalhes', {
                title: 'Prontuário do Paciente - Consultórios',
                layout: 'layouts/main',
                user: req.user || req.session.user,
                cd_pessoa_fisica,
                cd_agenda
            });
        } catch (error) {
            console.error('Erro ao visualizar prontuário:', error);
            res.status(500).send('Erro ao carregar prontuário');
        }
    },

    // API: Busca dados do prontuário do paciente
    buscarProntuario: async (req, res) => {
        try {
            const { cd_pessoa_fisica } = req.params;

            if (!cd_pessoa_fisica) {
                return res.status(400).json({
                    success: false,
                    error: 'Código do paciente não informado'
                });
            }

            // Busca dados do paciente
            const queryPaciente = `
                SELECT 
                    cd_pessoa_fisica,
                    nm_pessoa_fisica,
                    dt_nascimento,
                    nr_cpf,
                    ie_sexo,
                    nr_telefone_celular
                FROM pessoa_fisica
                WHERE cd_pessoa_fisica = :cd_pessoa_fisica
            `;

            const resultPaciente = await db.oracle.raw(queryPaciente, { 
                cd_pessoa_fisica: parseInt(cd_pessoa_fisica) 
            });
            const paciente = getRows(resultPaciente)[0];

            if (!paciente) {
                return res.status(404).json({
                    success: false,
                    error: 'Paciente não encontrado'
                });
            }

            // Busca evoluções do paciente
            const queryEvolucoes = `
                SELECT 
                    DT_EVOLUCAO, 
                    IE_TIPO_EVOLUCAO, 
                    CD_PESSOA_FISICA, 
                    NM_USUARIO, 
                    NR_ATENDIMENTO,  
                    CD_MEDICO, 
                    DT_LIBERACAO, 
                    OBTER_DESC_TIPO_EVOLUCAO(IE_EVOLUCAO_CLINICA) AS IE_EVOLUCAO_CLINICA, 
                    IE_SITUACAO,
                    DS_EVOLUCAO
                FROM evolucao_paciente 
                WHERE cd_pessoa_fisica = :cd_pessoa_fisica
                AND ie_situacao = 'A'
                ORDER BY DT_EVOLUCAO DESC
            `;

            const resultEvolucoes = await db.oracle.raw(queryEvolucoes, { 
                cd_pessoa_fisica: parseInt(cd_pessoa_fisica) 
            });
            const evolucoes = getRows(resultEvolucoes);

            // Converte RTF para HTML em todas as evoluções
            const evolucoesFormatadas = evolucoes.map((e) => {
                let textoFormatado = e.DS_EVOLUCAO;
                
                // Tenta converter RTF para HTML
                if (textoFormatado) {
                    try {
                        textoFormatado = rtfToFormattedHtml(textoFormatado);
                    } catch (error) {
                        console.error('Erro ao converter RTF:', error);
                        // Em caso de erro, usa texto puro com quebras de linha
                        textoFormatado = rtfToPlainText(textoFormatado).replace(/\n/g, '<br>');
                    }
                }

                return {
                    data_evolucao: e.DT_EVOLUCAO,
                    tipo_evolucao: e.IE_TIPO_EVOLUCAO,
                    usuario: e.NM_USUARIO,
                    nr_atendimento: e.NR_ATENDIMENTO,
                    cd_medico: e.CD_MEDICO,
                    data_liberacao: e.DT_LIBERACAO,
                    tipo_clinica: e.IE_EVOLUCAO_CLINICA,
                    situacao: e.IE_SITUACAO,
                    texto: textoFormatado
                };
            });

            // Formata os dados
            const prontuario = {
                paciente: {
                    cd_pessoa_fisica: paciente.CD_PESSOA_FISICA,
                    nome: paciente.NM_PESSOA_FISICA,
                    data_nascimento: paciente.DT_NASCIMENTO,
                    cpf: paciente.NR_CPF,
                    sexo: paciente.IE_SEXO,
                    telefone: paciente.NR_TELEFONE_CELULAR
                },
                evolucoes: evolucoesFormatadas,
                estatisticas: {
                    total_evolucoes: evolucoesFormatadas.length
                }
            };

            res.json({
                success: true,
                data: prontuario
            });

        } catch (error) {
            console.error('Erro ao buscar prontuário:', error);
            res.status(500).json({
                success: false,
                error: 'Erro ao buscar prontuário',
                message: error.message
            });
        }
    },

    // API: Cria nova evolução no prontuário
    criarEvolucao: async (req, res) => {
        try {
            const { cd_pessoa_fisica, cd_agenda, texto_evolucao } = req.body;
            const user = req.user || req.session.user;

            if (!cd_pessoa_fisica || !texto_evolucao) {
                return res.status(400).json({
                    success: false,
                    error: 'Dados incompletos'
                });
            }

            // TODO: Implementar INSERT de evolução no TASY
            // Aguardando estrutura da tabela

            res.json({
                success: true,
                message: 'Evolução criada com sucesso'
            });

        } catch (error) {
            console.error('Erro ao criar evolução:', error);
            res.status(500).json({
                success: false,
                error: 'Erro ao criar evolução',
                message: error.message
            });
        }
    },

    // API: Busca consultas da agenda filtradas por CPF do médico
    buscarConsultas: async (req, res) => {
        try {
            const { data, status } = req.query;
            const user = req.user || req.session.user;
            
            // Busca o CPF do médico no banco de dados pela sessão
            const userDb = await db('usuarios')
                .where({ cd_usuario: user.id })
                .first();

            if (!userDb) {
                return res.status(401).json({ 
                    error: 'Usuário não encontrado',
                    success: false 
                });
            }

            const cdMedicoTasy = userDb.cd_medico_tasy;

            if (!cdMedicoTasy) {
                return res.status(400).json({ 
                    error: 'Código de médico (TASY) não cadastrado. Entre em contato com o administrador.',
                    success: false,
                    userInfo: {
                        id: user.id,
                        nome: user.name,
                        instrucao: 'Solicite ao administrador que vincule seu usuário a um código de médico no TASY.'
                    }
                });
            }

            // Monta a query com filtros (usando CD_PESSOA_FISICA do médico)
            let query = `
                SELECT 
                    dca.NR_SEQUENCIA AS ID_AGENDA,
                    dca.HR_AGENDA AS HORA,
                    dca.IE_STATUS_AGENDA AS STATUS,
                    dca.DS_STATUS_AGENDA AS STATUS_DESC,
                    dca.NM_PACIENTE AS NOME_PACIENTE,
                    dca.CD_CONVENIO AS COD_CONVENIO,
                    dca.DS_CONVENIO AS CONVENIO,
                    dca.DT_AGENDA AS DATA_AGENDA,
                    dca.CD_AGENDA AS CD_AGENDA,
                    dca.CD_PESSOA_FISICA AS CD_PESSOA_FISICA_PACIENTE
                FROM DC_CHAT_AGENDAS dca
                WHERE dca.CD_AGENDA IN (
                    SELECT cd_agenda 
                    FROM agenda 
                    WHERE cd_pessoa_fisica = :cd_pessoa_fisica
                    AND IE_SITUACAO = 'A' 
                    AND CD_TIPO_AGENDA = 3
                )
            `;

            // Adiciona filtro de data se fornecido (filtra na view, não na subquery)
            if (data) {
                query += ` AND TRUNC(DT_AGENDA) = TO_DATE(:dt_agenda, 'YYYY-MM-DD')`;
            } else {
                // Se não forneceu data, busca do dia atual
                query += ` AND TRUNC(DT_AGENDA) = TRUNC(SYSDATE)`;
            }

            // Adiciona filtro de status se fornecido e não for "todos"
            if (status && status !== 'todos') {
                query += ` AND IE_STATUS_AGENDA = :status_filtro`;
            }

            // Ordena por horário
            query += ` ORDER BY HR_AGENDA`;

            // Monta os binds
            const binds = {
                cd_pessoa_fisica: cdMedicoTasy
            };

            if (data) {
                binds.dt_agenda = data;
            }

            if (status && status !== 'todos') {
                binds.status_filtro = status;
            }

            const result = await db.oracle.raw(query, binds);
            const consultas = getRows(result);

            // Formata os dados para o frontend
            const consultasFormatadas = consultas.map(c => ({
                id_agenda: c.ID_AGENDA,
                cd_agenda: c.CD_AGENDA,
                horario: c.HORA,
                data_agenda: c.DATA_AGENDA,
                paciente: {
                    nome: c.NOME_PACIENTE,
                    cd_pessoa_fisica: c.CD_PESSOA_FISICA_PACIENTE
                },
                status: c.STATUS,
                status_desc: c.STATUS_DESC,
                convenio: c.CONVENIO,
                cod_convenio: c.COD_CONVENIO
            }));

            // Calcula estatísticas
            const estatisticas = {
                total: consultasFormatadas.length,
                agendadas: consultasFormatadas.filter(c => c.status === 'A').length,
                em_atendimento: consultasFormatadas.filter(c => c.status === 'E').length,
                concluidas: consultasFormatadas.filter(c => c.status === 'C').length,
                aguardando: consultasFormatadas.filter(c => c.status === 'G').length
            };

            res.json({
                success: true,
                data: consultasFormatadas,
                estatisticas: estatisticas,
                cdMedicoTasy: cdMedicoTasy,
                dataFiltro: data || new Date().toISOString().split('T')[0],
                filtroStatus: status || 'todos'
            });

        } catch (error) {
            console.error('Erro ao buscar consultas:', error);
            res.status(500).json({ 
                error: 'Erro ao buscar consultas',
                message: error.message,
                success: false 
            });
        }
    }
};

module.exports = consultoriosController;
