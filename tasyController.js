const db = require('../infra/database/connection');

module.exports = {

    // 1. DROPDOWN 1: TIPO DE AGENDA / UNIDADE
    listarUnidades: async (req, res) => {
        try {
            const sql = `
                SELECT DISTINCT 1 AS CD_TIPO, 'Agenda de Consultas' AS DS_TIPO FROM DUAL 
                UNION ALL
                SELECT DISTINCT 2 AS CD_TIPO, 'Agenda de Exames' AS DS_TIPO FROM DUAL 
                ORDER BY DS_TIPO
            `;
            const dados = await db.oracle.raw(sql);
            res.json(dados);
        } catch (e) {
            console.error("Erro Unidades:", e.message);
            res.status(500).json({ error: e.message });
        }
    },

    // 2. DROPDOWN 2: ESPECIALIDADES
    listarEspecialidades: async (req, res) => {
        const { tipoId } = req.params;
        try {
            let sql = "";
            
            // 1 = Consulta
            if (parseInt(tipoId) === 1) {
                sql = `
                    SELECT DISTINCT 
                        e.cd_especialidade,
                        obter_ds_especialidade(e.cd_especialidade) as ds_especialidade
                    FROM agenda a
                    JOIN agenda_cons_especialidade e ON a.cd_agenda = e.cd_agenda
                    WHERE a.cd_tipo_agenda = 3 
                      AND a.ie_situacao = 'A'
                    ORDER BY ds_especialidade
                `;
            } 
            // 2 = Exame
            else {
                sql = `
                    SELECT DISTINCT 
                        b.CD_SETOR_EXCLUSIVO as cd_especialidade,
                        obter_ds_setor_atendimento(b.CD_SETOR_EXCLUSIVO) as ds_especialidade
                    FROM agenda b
                    WHERE b.cd_tipo_agenda = 2 
                      AND b.ie_situacao = 'A'
                      AND b.CD_SETOR_EXCLUSIVO IS NOT NULL
                    ORDER BY ds_especialidade
                `;
            }

            const dados = await db.oracle.raw(sql);
            res.json(dados);
        } catch (e) {
            console.error("Erro Especialidades:", e.message);
            res.status(500).json({ error: e.message });
        }
    },

    // 3. DROPDOWN 3: CONVÊNIOS
    listarConvenios: async (req, res) => {
        try {
            const sql = `
                SELECT DISTINCT 
                    CD_CONVENIO AS CD_CONVENIO, 
                    DS_CONVENIO AS DS_CONVENIO 
                FROM CONVENIO
                WHERE IE_SITUACAO = 'A'
                ORDER BY DS_CONVENIO
            `;
            const dados = await db.oracle.raw(sql);
            res.json(dados);
        } catch (e) {
            console.error("Erro Convenios:", e.message);
            res.status(500).json({ error: e.message });
        }
    },

    // 4. DROPDOWN 4: RECURSOS (MÉDICOS)
    listarRecursos: async (req, res) => {
        try {
            const { tipo, especialidade, convenio } = req.query; 

            let sql = `
                SELECT DISTINCT
                    CD_AGENDA AS CD_AGENDA,
                    DS_AGENDA AS DS_AGENDA
                FROM DC_CHAT_AGENDAS
                WHERE 1=1 
            `;

            const bindings = {};

            if (tipo) {
                sql += ` AND CD_TIPO = :tipo `;
                bindings.tipo = tipo;
            }

            if (especialidade) {
                sql += ` AND CD_ESPECIALIDADE = :especialidade `;
                bindings.especialidade = especialidade;
            }

            if (convenio) {
                sql += ` AND CD_CONVENIO = :convenio `;
                bindings.convenio = convenio;
            }

            sql += ` ORDER BY DS_AGENDA`;

            const dados = await db.oracle.raw(sql, bindings);
            res.json(dados);

        } catch (e) { 
            console.error("Erro Recursos:", e.message);
            res.status(500).json({ error: e.message }); 
        }
    },

    // 5. GRID DE HORÁRIOS
    listarAgenda: async (req, res) => {
        try {
            const { recurso, data } = req.body;

            if (!recurso || !data) {
                return res.status(400).json({ error: 'Parâmetros obrigatórios.' });
            }

            const recursoId = parseInt(recurso, 10);
            if (isNaN(recursoId)) {
                return res.status(400).json({ error: 'ID do recurso inválido.' });
            }

            const dataLimpa = data.substring(0, 10);

            const sql = `
                SELECT 
                    NR_SEQUENCIA       AS ID,
                    HR_AGENDA          AS HORA,
                    IE_STATUS_AGENDA   AS IE_STATUS,
                    DS_STATUS_AGENDA   AS STATUS_DESC,
                    NM_PACIENTE        AS PACIENTE,
                    CD_CONVENIO        AS CODIGO_CONVENIO,
                    DS_CONVENIO        AS CONVENIO
                FROM DC_CHAT_AGENDAS          
                WHERE CD_AGENDA = :recursoId
                AND TRUNC(DT_AGENDA) = TO_DATE(:dataLimpa, 'YYYY-MM-DD')
                ORDER BY HR_AGENDA ASC
            `;
            
            const dados = await db.oracle.raw(sql, { recursoId, dataLimpa });
            res.json(dados);

        } catch (e) { 
            console.error("Erro Agenda:", e.message);
            res.status(500).json({ error: e.message }); 
        }
    },

    // 6. AÇÕES GERAIS (Confirmar, Cancelar, Bloquear, Transferir)
    confirmar: async (req, res) => {
        const { agendaId, obs } = req.body;
        if (!agendaId) return res.status(400).json({ error: 'ID obrigatório' });

        try {
            const params = {
                cd_tipo: 1, 
                observacao: obs || 'Confirmado via Web',
                IdSequencia: agendaId
            };
            const sql = `
                BEGIN
                    IF :cd_tipo = 1 THEN
                        UPDATE agenda_consulta SET ie_status_agenda = 'CN', dt_confirmacao = SYSDATE, nm_usuario_confirm = 'DATA', ds_confirmacao = :observacao WHERE nr_sequencia = :IdSequencia;
                    ELSIF :cd_tipo = 2 THEN
                        UPDATE agenda_paciente SET ie_status_agenda = 'CN', dt_confirmacao = SYSDATE, nm_usuario_confirm = 'DATA', ds_confirmacao = :observacao WHERE nr_sequencia = :IdSequencia;
                    END IF;
                    COMMIT;
                END;
            `;
            await db.oracle.raw(sql, params);
            res.json({ success: true });
        } catch (e) {
            console.error("Erro Confirmar:", e.message);
            res.status(500).json({ error: 'Erro ao confirmar.' });
        }
    },

    cancelar: async (req, res) => {
        const { agendaId } = req.body;
        if (!agendaId) return res.status(400).json({ error: 'ID obrigatório' });
        try {
            const params = { cd_tipo: 1, IdSequencia: agendaId };
            const sql = `
                BEGIN
                    IF :cd_tipo = 1 THEN
                        UPDATE agenda_consulta SET cd_motivo_cancelamento = 302, IE_STATUS_AGENDA = 'C', dt_cancelamento = SYSDATE, nm_usuario_cancelamento = 'DATA' WHERE nr_sequencia = :IdSequencia;
                    ELSIF :cd_tipo = 2 THEN
                        UPDATE agenda_paciente SET cd_motivo_cancelamento = 302, IE_STATUS_AGENDA = 'C', dt_cancelamento = SYSDATE, nm_usuario_cancel = 'DATA' WHERE nr_sequencia = :IdSequencia;
                    END IF;
                    COMMIT;
                END;
            `;
            await db.oracle.raw(sql, params);
            res.json({ success: true });
        } catch (e) {
            console.error("Erro Cancelar:", e.message);
            res.status(500).json({ error: 'Erro ao cancelar.' });
        }
    },

    bloquear: async (req, res) => {
        const { agendaId } = req.body;
        if (!agendaId) return res.status(400).json({ error: 'ID obrigatório' });
        try {
            const params = { cd_tipo: 1, IdSequencia: agendaId };
            const sql = `
                BEGIN
                    IF :cd_tipo = 1 THEN
                        UPDATE agenda_consulta SET ie_status_agenda = 'B', nr_seq_motivo_bloq = 5, dt_atualizacao = SYSDATE WHERE nr_sequencia = :IdSequencia;
                    ELSIF :cd_tipo = 2 THEN
                        UPDATE agenda_paciente SET ie_status_agenda = 'B', nr_seq_motivo_bloq = 5, dt_bloqueio = SYSDATE, nm_usuario_bloq = 'DATA', dt_atualizacao = SYSDATE WHERE nr_sequencia = :IdSequencia;
                    END IF;
                    COMMIT;
                END;
            `;
            await db.oracle.raw(sql, params);
            res.json({ success: true });
        } catch (e) {
            console.error("Erro Bloquear:", e.message);
            res.status(500).json({ error: 'Erro ao bloquear.' });
        }
    },

    agendarNovo: async (req, res) => {
        const { agendaId, pacienteNome, obs, cd_tipo } = req.body;
        if (!agendaId || !pacienteNome) return res.status(400).json({ error: 'Dados incompletos.' });

        const tipoAgenda = cd_tipo || 1; 

        try {
            const params = {
                pacienteNome: pacienteNome.toUpperCase(),
                obs: obs || 'Agendado via Chat',
                agendaId: agendaId,
                tipo: tipoAgenda
            };
            const sql = `
                BEGIN
                    IF :tipo = 1 THEN
                        UPDATE agenda_consulta SET nm_paciente = :pacienteNome, ie_status_agenda = 'A', ds_observacao = :obs, dt_atualizacao = SYSDATE, nm_usuario_agendou = 'DATACARE' WHERE nr_sequencia = :agendaId;
                    ELSIF :tipo = 2 THEN
                        UPDATE agenda_paciente SET nm_paciente = :pacienteNome, ie_status_agenda = 'A', ds_observacao = :obs, dt_atualizacao = SYSDATE, nm_usuario_agend = 'DATACARE' WHERE nr_sequencia = :agendaId;
                    END IF;
                    COMMIT;
                END;
            `;
            await db.oracle.raw(sql, params);
            res.json({ success: true });
        } catch (e) {
            console.error("Erro Agendar:", e.message);
            res.status(500).json({ error: 'Erro ao agendar.' });
        }
    },

    transferir: async (req, res) => {
        const { agendaIdAntiga, agendaIdNova, obs, cd_tipo } = req.body;
        if (!agendaIdAntiga || !agendaIdNova) return res.status(400).json({ error: 'IDs obrigatórios.' });

        try {
            const params = {
                idAntigo: agendaIdAntiga,
                idNovo: agendaIdNova,
                tipo: cd_tipo || 1, 
                obs: obs || 'Transferido via Chat',
                usuario: 'DATACARE'
            };

            const sql = `
                DECLARE
                    v_paciente VARCHAR2(200);
                BEGIN
                    IF :tipo = 1 THEN
                        SELECT nm_paciente INTO v_paciente FROM agenda_consulta WHERE nr_sequencia = :idAntigo;
                        UPDATE agenda_consulta SET ie_status_agenda = 'C', cd_motivo_cancelamento = 302, dt_cancelamento = SYSDATE, nm_usuario_cancelamento = :usuario WHERE nr_sequencia = :idAntigo;
                        UPDATE agenda_consulta SET nm_paciente = v_paciente, ie_status_agenda = 'A', ds_observacao = :obs, dt_atualizacao = SYSDATE, nm_usuario_agendou = :usuario WHERE nr_sequencia = :idNovo;
                    ELSIF :tipo = 2 THEN
                        SELECT nm_paciente INTO v_paciente FROM agenda_paciente WHERE nr_sequencia = :idAntigo;
                        UPDATE agenda_paciente SET ie_status_agenda = 'C', cd_motivo_cancelamento = 302, dt_cancelamento = SYSDATE, nm_usuario_cancel = :usuario WHERE nr_sequencia = :idAntigo;
                        UPDATE agenda_paciente SET nm_paciente = v_paciente, ie_status_agenda = 'A', ds_observacao = :obs, dt_atualizacao = SYSDATE, nm_usuario_agend = :usuario WHERE nr_sequencia = :idNovo;
                    END IF;
                    COMMIT;
                END;
            `;
            await db.oracle.raw(sql, params);
            res.json({ success: true, message: "Transferência realizada." });
        } catch (e) {
            console.error("Erro Transferencia:", e.message);
            res.status(500).json({ error: e.message });
        }
    },
    // 8. ORIENTAÇÕES DAS AGENDAS
    obterOrientacao: async (req, res) => {
        try {
            const { agendaId, tipo } = req.query;
            
            if (!agendaId || !tipo) {
                return res.json({ orientacao: '' });
            }

            let sql = "";
            if (parseInt(tipo) === 1) {
                sql = `SELECT CONVERT_TEXT_TO_HTML(DS_ORIENTACAO) AS DS_ORIENTACAO FROM AGENDA WHERE CD_AGENDA = :agendaId`;
            } else {
                sql = `SELECT obter_html_orientacao(ROWID) AS DS_ORIENTACAO FROM AGENDA_ORIENTACAO WHERE CD_AGENDA = :agendaId`;
            }

            const dados = await db.oracle.raw(sql, { agendaId });
            const texto = (dados && dados.length > 0) ? dados[0].DS_ORIENTACAO : '';
            res.json({ orientacao: texto });

        } catch (e) {
            console.error("Erro Orientacao:", e.message);
            res.json({ orientacao: '' }); 
        }
    },

    // 8. LISTA DE CONTATOS ATIVOS (Pacientes para Confirmar Amanhã - Agenda 334)
    listarContatosAtivos: async (req, res) => {
        try {
            const sql = `
                SELECT 
                    a.cd_agenda                                  as "id",
                    a.nm_paciente                                as "nome",
                    obter_nome_medico(b.cd_pessoa_fisica, 'ps')  as "motivo", -- Nome do médico entra como motivo/descrição
                    TO_CHAR(a.dt_agenda, 'HH24:MI')              as "horario",
                    SUBSTR(REGEXP_REPLACE(a.nr_telefone, '[^0-9]', ''), 1, 11) as "whatsapp",
                    a.dt_agenda                                  as "data_original"
                FROM agenda_consulta a
                JOIN agenda b ON a.cd_agenda = b.cd_agenda
                WHERE a.CD_AGENDA in (334)
                AND a.IE_STATUS_AGENDA = 'N'
                AND trunc(a.DT_AGENDA) = trunc(sysdate) + 1
            `;

            const dados = await db.oracle.raw(sql);
            res.json(dados);

        } catch (e) {
            console.error("Erro Contatos Ativos (Agenda 334):", e.message);
            res.json([]); 
        }
    }
};