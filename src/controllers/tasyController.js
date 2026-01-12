const db = require('../infra/database/connection');

module.exports = {

    // 1. DROPDOWN 1: TIPO DE AGENDA / UNIDADE (JÁ ESTÁ FUNCIONANDO ✅)
    listarUnidades: async (req, res) => {
        try {
            const sql = `
                SELECT DISTINCT 
                    CD_TIPO AS CD_TIPO, 
                    DS_TIPO AS DS_TIPO 
                FROM DC_CHAT_AGENDAS 
            `;
            const dados = await db.oracle.raw(sql);
            res.json(dados);
        } catch (e) {
            console.error("Erro Unidades:", e.message);
            res.status(500).json({ error: e.message });
        }
    },

    // 2. DROPDOWN 2: ESPECIALIDADES (NOVO ✅)
    // Filtra especialidades baseadas no Tipo selecionado
    listarEspecialidades: async (req, res) => {
        const { tipoId } = req.params;
        try {
            const sql = `
                SELECT DISTINCT 
                    CD_ESPECIALIDADE AS CD_ESPECIALIDADE, 
                    DS_ESPECIALIDADE AS DS_ESPECIALIDADE 
                FROM DC_CHAT_AGENDAS 
                WHERE CD_TIPO = :tipoId
                ORDER BY DS_ESPECIALIDADE
            `;
            const dados = await db.oracle.raw(sql, { tipoId });
            res.json(dados);
        } catch (e) {
            console.error("Erro Especialidades:", e.message);
            res.status(500).json({ error: e.message });
        }
    },

    // 3. DROPDOWN 3: CONVÊNIOS (NOVO ✅)
    // Filtra convênios baseados na Especialidade selecionada
    listarConvenios: async (req, res) => {
        try {
            const sql = `
                SELECT DISTINCT 
                    CD_CONVENIO AS CD_CONVENIO, 
                    DS_CONVENIO AS DS_CONVENIO 
                FROM DC_CHAT_AGENDAS 
                WHERE CD_ESPECIALIDADE = :especialidadeId
                ORDER BY DS_CONVENIO
            `;
            const dados = await db.oracle.raw(sql, { especialidadeId });
            res.json(dados);
        } catch (e) {
            console.error("Erro Convenios:", e.message);
            res.status(500).json({ error: e.message });
        }
    },

    // 4. DROPDOWN 4: RECURSOS / MÉDICOS (ATUALIZADO ✅)
    // Agora filtra por Especialidade e Convênio (que vêm da URL ?especialidade=X&convenio=Y)
    listarRecursos: async (req, res) => {
        try {
            // O front envia: /api/tasy/recursos?especialidade=123&convenio=456
            const { especialidade, convenio } = req.query; 

            // Validação simples para não rodar query sem filtro
            if (!especialidade || !convenio) {
                return res.json([]); 
            }

            const sql = `
                SELECT DISTINCT
                    CD_AGENDA AS CD_AGENDA,
                    DS_AGENDA AS DS_AGENDA
                FROM DC_CHAT_AGENDAS
                WHERE CD_ESPECIALIDADE = :especialidade
                  AND CD_CONVENIO = :convenio
                ORDER BY DS_AGENDA
            `;
            
            const dados = await db.oracle.raw(sql, { especialidade, convenio });
            res.json(dados);
        } catch (e) { 
            console.error("Erro Recursos:", e.message);
            res.status(500).json({ error: e.message }); 
        }
    },

    // NOVA FUNÇÃO PARA O FLUXO DE EXAMES
    listarRecursosPorTipo: async (req, res) => {
        const { tipoId } = req.params;
        try {
            // Busca todas as agendas daquele tipo (Ex: Todas as agendas de RX, USG, TC)
            const sql = `
                SELECT DISTINCT 
                    CD_AGENDA AS CD_AGENDA, 
                    DS_AGENDA AS DS_AGENDA 
                FROM DC_CHAT_AGENDAS 
                WHERE CD_TIPO = :tipoId
                ORDER BY DS_AGENDA
            `;
            const dados = await db.oracle.raw(sql, { tipoId });
            res.json(dados);
        } catch (e) {
            console.error("Erro Recursos Simples:", e.message);
            res.status(500).json({ error: e.message });
        }
    },

    // 5. GRID PRINCIPAL: A LISTA DE HORÁRIOS (MANTIDO IGUAL ✅)
    listarAgenda: async (req, res) => {
        try {
            const { recurso, data } = req.body;
            
            const sql = `
                SELECT 
                    NR_SEQUENCIA   AS ID,
                    HR_AGENDA    AS HORA,
                    IE_STATUS_AGENDA      AS IE_STATUS,
                    DS_STATUS_AGENDA      AS STATUS_DESC,
                    NM_PACIENTE    AS PACIENTE,
                    CD_CONVENIO AS CODIGO_CONVENIO,
                    DS_CONVENIO AS CONVENIO
                
                FROM DC_CHAT_AGENDAS          
                WHERE CD_AGENDA = :recurso
                AND TRUNC(DT_AGENDA) = TO_DATE(:data, 'YYYY-MM-DD')
                ORDER BY HR_AGENDA ASC
            `;
            
            const dados = await db.oracle.raw(sql, { recurso, data });
            res.json(dados);

        } catch (e) { 
            console.error("Erro Agenda:", e.message);
            res.status(500).json({ error: e.message }); 
        }
    },

    // 6. FUNÇÕES DE AÇÃO (CONFIRMAR, CANCELAR, BLOQUEAR, AGENDAR)
    // Mantidas exatamente como você enviou
    confirmar: async (req, res) => {
        const { agendaId, obs } = req.body;
        if (!agendaId) return res.status(400).json({ error: 'ID da agenda obrigatório' });

        try {
            const params = {
                cd_tipo: 1, 
                observacao: obs || 'Confirmado via Painel Web',
                IdSequencia: agendaId
            };

            const sql = `
                BEGIN
                    IF :cd_tipo = 1 THEN
                        UPDATE agenda_consulta
                        SET ie_status_agenda   = 'CN',
                            dt_confirmacao     = SYSDATE,
                            nm_usuario_confirm = 'DATA',
                            ds_confirmacao     = :observacao
                        WHERE nr_sequencia       = :IdSequencia;
                    ELSIF :cd_tipo = 2 THEN
                        UPDATE agenda_paciente
                        SET ie_status_agenda   = 'CN',
                            dt_confirmacao     = SYSDATE,
                            nm_usuario_confirm = 'DATA',
                            ds_confirmacao     = :observacao
                        WHERE nr_sequencia       = :IdSequencia;
                    END IF;
                    COMMIT;
                END;
            `;
            await db.oracle.raw(sql, params);
            res.json({ success: true });
        } catch (e) {
            console.error("Erro ao Confirmar:", e.message);
            res.status(500).json({ error: 'Erro ao confirmar no banco.' });
        }
    },

    cancelar: async (req, res) => {
        const { agendaId } = req.body;
        if (!agendaId) return res.status(400).json({ error: 'ID da agenda obrigatório' });

        try {
            const params = {
                cd_tipo: 1,
                IdSequencia: agendaId
            };
            const sql = `
                BEGIN
                    IF :cd_tipo = 1 THEN
                        UPDATE agenda_consulta
                        SET cd_motivo_cancelamento  = 302,
                            IE_STATUS_AGENDA = 'C',
                            dt_cancelamento         = SYSDATE,
                            nm_usuario_cancelamento = 'DATA'
                        WHERE nr_sequencia            = :IdSequencia;
                    ELSIF :cd_tipo = 2 THEN
                        UPDATE agenda_paciente
                        SET cd_motivo_cancelamento = 302,
                            IE_STATUS_AGENDA = 'C',
                            dt_cancelamento        = SYSDATE,
                            nm_usuario_cancel      = 'DATA'
                        WHERE nr_sequencia           = :IdSequencia;
                    END IF;
                    COMMIT;
                END;
            `;
            await db.oracle.raw(sql, params);
            res.json({ success: true });
        } catch (e) {
            console.error("Erro ao Cancelar:", e.message);
            res.status(500).json({ error: 'Erro ao cancelar no banco.' });
        }
    },

    bloquear: async (req, res) => {
        const { agendaId } = req.body;
        if (!agendaId) return res.status(400).json({ error: 'ID da agenda obrigatório' });

        try {
            const params = {
                cd_tipo: 1,
                IdSequencia: agendaId
            };
            const sql = `
                BEGIN
                    IF :cd_tipo = 1 THEN
                        UPDATE agenda_consulta
                        SET ie_status_agenda   = 'B',
                            nr_seq_motivo_bloq = 5,
                            dt_atualizacao     = SYSDATE
                        WHERE nr_sequencia       = :IdSequencia;
                    ELSIF :cd_tipo = 2 THEN
                        UPDATE agenda_paciente
                        SET ie_status_agenda   = 'B',
                            nr_seq_motivo_bloq = 5,
                            dt_bloqueio        = SYSDATE,
                            nm_usuario_bloq    = 'DATA',
                            dt_atualizacao     = SYSDATE
                        WHERE nr_sequencia       = :IdSequencia;
                    END IF;
                    COMMIT;
                END;
            `;
            await db.oracle.raw(sql, params);
            res.json({ success: true });
        } catch (e) {
            console.error("Erro ao Bloquear:", e.message);
            res.status(500).json({ error: 'Erro ao bloquear no banco.' });
        }
    },

    agendarNovo: async (req, res) => {
        const { agendaId, pacienteNome, obs } = req.body;
        if (!agendaId || !pacienteNome) return res.status(400).json({ error: 'Dados incompletos.' });

        try {
            const cd_tipo = 1; 
            const params = {
                pacienteNome: pacienteNome.toUpperCase(),
                obs: obs || 'Agendado via Chat',
                agendaId: agendaId
            };

            const sql = `
                BEGIN
                    IF ${cd_tipo} = 1 THEN
                        UPDATE agenda_consulta
                           SET nm_paciente        = :pacienteNome,
                               ie_status_agenda   = 'A',
                               ds_observacao      = :obs,
                               dt_atualizacao     = SYSDATE,
                               nm_usuario_agendou = 'DATACARE'
                         WHERE nr_sequencia       = :agendaId;
                    END IF;
                    COMMIT;
                END;
            `;
            await db.oracle.raw(sql, params);
            res.json({ success: true });
        } catch (e) {
            console.error("Erro ao Agendar Tasy:", e.message);
            res.status(500).json({ error: 'Erro ao gravar agendamento no Tasy.' });
        }
    },

    transferir: async (req, res) => {
        res.status(501).json({ error: 'Transferência de horário via Tasy ainda não implementada.' });
    }
};