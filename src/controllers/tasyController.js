const db = require('../infra/database/connection');

module.exports = {

    // 1. DROPDOWN 1: TIPO DE AGENDA / UNIDADE (JÁ ESTÁ FUNCIONANDO ✅)
    listarUnidades: async (req, res) => {
        try {
            // Sua query ajustada que já funcionou
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

    // 2. DROPDOWN 2: RECURSOS (MÉDICOS/SALAS) DENTRO DO TIPO ESCOLHIDO ⏳
    listarRecursos: async (req, res) => {
        try {
            const { unidadeId } = req.params; // Isso vem do dropdown 1 (CD_TIPO)

            // [AQUI PRECISA DO SEU SQL]
            // Exemplo: Buscar os médicos/recursos que atendem esse tipo de agenda
            const sql = `
                SELECT DISTINCT
                    CD_AGENDA AS CD_AGENDA,
                    DS_AGENDA AS DS_AGENDA
                FROM DC_CHAT_AGENDAS
                WHERE CD_TIPO = :unidadeId
            `;
            
            const dados = await db.oracle.raw(sql, { unidadeId });
            res.json(dados);
        } catch (e) { 
            console.error("Erro Recursos:", e.message);
            res.status(500).json({ error: e.message }); 
        }
    },

    // 3. GRID PRINCIPAL: A LISTA DE HORÁRIOS 📅
    listarAgenda: async (req, res) => {
        try {
            const { recurso, data } = req.body;
            
            // [AQUI PRECISA DO SEU SQL FORTE]
            // O Front espera as colunas: ID, HORA, IE_STATUS, STATUS_DESC, PACIENTE
            
            const sql = `
                SELECT 
                    NR_SEQUENCIA   AS ID,
                    HR_AGENDA    AS HORA,        -- Ex: '08:00'
                    IE_STATUS_AGENDA      AS IE_STATUS,   -- 'L' (Livre), 'A' (Agendado), 'B' (Bloq)
                    DS_STATUS_AGENDA      AS STATUS_DESC, -- 'Livre', 'Confirmado'...
                    NM_PACIENTE    AS PACIENTE     -- Nome do paciente ou null se livre
                
                FROM DC_CHAT_AGENDAS          
                WHERE CD_AGENDA = :recurso
                AND TRUNC(DT_AGENDA) = TO_DATE(:data, 'YYYY-MM-DD') -- Cuidado com o TRUNC
                ORDER BY HR_AGENDA ASC
            `;
            
            const dados = await db.oracle.raw(sql, { recurso, data });
            res.json(dados);

        } catch (e) { 
            console.error("Erro Agenda:", e.message);
            res.status(500).json({ error: e.message }); 
        }
    },

    // 4. REALIZAR AGENDAMENTO (Botão Direito -> Modal)
    // 1. CONFIRMAR AGENDAMENTO (Status -> CN)
    confirmar: async (req, res) => {
        const { agendaId, obs } = req.body;

        if (!agendaId) return res.status(400).json({ error: 'ID da agenda obrigatório' });

        try {
            const params = {
                cd_tipo: 1, // 1=Médico, 2=Exame. (Ajuste se precisar vir do front)
                observacao: obs || 'Confirmado via Painel Web', // Texto padrão caso não venha obs
                IdSequencia: agendaId
            };

            const sql = `
                BEGIN
                    -- Tipo 1: Agenda Consulta (Médicos)
                    IF :cd_tipo = 1 THEN
                        UPDATE agenda_consulta
                           SET ie_status_agenda   = 'CN',
                               dt_confirmacao     = SYSDATE,
                               nm_usuario_confirm = 'DATA',
                               ds_confirmacao     = :observacao
                         WHERE nr_sequencia       = :IdSequencia;

                    -- Tipo 2: Agenda Paciente (Exames/SADT)
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

    // 2. CANCELAR AGENDAMENTO
    cancelar: async (req, res) => {
        const { agendaId } = req.body;

        if (!agendaId) return res.status(400).json({ error: 'ID da agenda obrigatório' });

        try {
            const params = {
                cd_tipo: 1, // 1=Médico, 2=Exame
                IdSequencia: agendaId
            };

            const sql = `
                BEGIN
                    -- Tipo 1: Agenda Consulta (Médicos)
                    IF :cd_tipo = 1 THEN
                        UPDATE agenda_consulta
                           SET cd_motivo_cancelamento  = 302,
                               IE_STATUS_AGENDA        = 'C',
                               dt_cancelamento         = SYSDATE,
                               nm_usuario_cancelamento = 'DATA'
                         WHERE nr_sequencia            = :IdSequencia;

                    -- Tipo 2: Agenda Paciente (Exames/SADT)
                    ELSIF :cd_tipo = 2 THEN
                        UPDATE agenda_paciente
                           SET cd_motivo_cancelamento = 302,
                               IE_STATUS_AGENDA       = 'C',
                               dt_cancelamento        = SYSDATE,
                               nm_usuario_cancel      = 'DATA' -- Se der erro ORA-00904, tente NM_USUARIO_CANCELAMENTO
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

    // 3. BLOQUEAR AGENDA
    bloquear: async (req, res) => {
        const { agendaId } = req.body;

        if (!agendaId) return res.status(400).json({ error: 'ID da agenda obrigatório' });

        try {
            const params = {
                cd_tipo: 1, // 1=Médico, 2=Exame (Pode ajustar para vir do req.body)
                IdSequencia: agendaId
            };

            const sql = `
                BEGIN
                    -- Tipo 1: Agenda Consulta (Médicos)
                    IF :cd_tipo = 1 THEN
                        UPDATE agenda_consulta
                           SET ie_status_agenda   = 'B',
                               nr_seq_motivo_bloq = 5,
                               dt_atualizacao     = SYSDATE
                         WHERE nr_sequencia       = :IdSequencia;

                    -- Tipo 2: Agenda Paciente (Exames/SADT)
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

    // --- NOVA FUNÇÃO: AGENDAR PACIENTE (Do Modal do Index.ejs) ---
    agendarNovo: async (req, res) => {
        const { agendaId, pacienteNome, obs } = req.body;

        if (!agendaId || !pacienteNome) {
            return res.status(400).json({ error: 'Dados incompletos.' });
        }

        try {
            // Assumindo tipo 1 (Médico) por padrão, mas idealmente viria do front
            const cd_tipo = 1; 
            
            const params = {
                pacienteNome: pacienteNome.toUpperCase(), // Padronizar caixa alta
                obs: obs || 'Agendado via Chat',
                agendaId: agendaId
            };

            const sql = `
                BEGIN
                    IF ${cd_tipo} = 1 THEN
                        UPDATE agenda_consulta
                           SET nm_paciente        = :pacienteNome,
                               ie_status_agenda   = 'A', -- A = Agendado
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

    // --- STUB: TRANSFERIR AGENDA TASY (Futuro) ---
    transferir: async (req, res) => {
        // Esse é complexo no Tasy (Envolve Procedure de Troca). 
        // Vamos deixar travado por enquanto para evitar corromper agenda.
        res.status(501).json({ error: 'Transferência de horário via Tasy ainda não implementada.' });
    }
};