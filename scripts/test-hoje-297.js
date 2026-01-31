require('dotenv').config();
const db = require('../src/infra/database/connection');

async function test() {
    try {
        const hoje = '2026-01-30';
        console.log(`🔍 Buscando consultas para ${hoje}\n`);
        
        const query = `
            SELECT COUNT(*) as TOTAL 
            FROM DC_CHAT_AGENDAS 
            WHERE CD_AGENDA IN (
                SELECT cd_agenda 
                FROM agenda 
                WHERE cd_pessoa_fisica = 297 
                AND IE_SITUACAO = 'A' 
                AND CD_TIPO_AGENDA = 3
            )
            AND TRUNC(DT_AGENDA) = TO_DATE('${hoje}', 'YYYY-MM-DD')
        `;
        
        const result = await db.oracle.raw(query);
        const rows = Array.isArray(result) ? result : result.rows;
        
        console.log(`✅ Total de consultas para ${hoje}:`, rows[0].TOTAL);
        
        // Buscar detalhes se tiver consultas
        if (rows[0].TOTAL > 0) {
            const q2 = `
                SELECT HR_AGENDA, NM_PACIENTE, DS_STATUS_AGENDA
                FROM DC_CHAT_AGENDAS
                WHERE CD_AGENDA IN (
                    SELECT cd_agenda 
                    FROM agenda 
                    WHERE cd_pessoa_fisica = 297 
                    AND IE_SITUACAO = 'A' 
                    AND CD_TIPO_AGENDA = 3
                )
                AND TRUNC(DT_AGENDA) = TO_DATE('${hoje}', 'YYYY-MM-DD')
                ORDER BY HR_AGENDA
            `;
            
            const r2 = await db.oracle.raw(q2);
            const consultas = Array.isArray(r2) ? r2 : r2.rows;
            
            console.log(`\n📋 Consultas do dia:\n`);
            consultas.forEach((c, i) => {
                console.log(`   ${i + 1}. ${c.HR_AGENDA} - ${c.NM_PACIENTE} [${c.DS_STATUS_AGENDA}]`);
            });
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

test();
