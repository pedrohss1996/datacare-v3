const db = require('../infra/database/connection');

module.exports = {

    // 1. DROPDOWN 1: TIPO DE AGENDA / UNIDADE (JÁ ESTÁ FUNCIONANDO ✅)
    listarUnidades: async (req, res) => {
        try {
            // Sua query ajustada que já funcionou
            const sql = `
                SELECT DISTINCT 
                    CD_TIPO AS CD_UNIDADE, 
                    DS_TIPO AS DS_UNIDADE 
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
                    CD_AGENDA AS CD_RECURSO,
                    DS_AGENDA AS DS_RECURSO
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
    }
};