require('dotenv').config();
const db = require('../src/infra/database/connection');

async function test() {
    try {
        console.log('🔍 Testando CD_PESSOA_FISICA = 297\n');
        
        // Teste 1: Total na tabela agenda
        const q1 = `SELECT COUNT(*) as TOTAL FROM agenda WHERE cd_pessoa_fisica = 297 AND IE_SITUACAO = 'A' AND CD_TIPO_AGENDA = 3`;
        const r1 = await db.oracle.raw(q1);
        const rows1 = Array.isArray(r1) ? r1 : r1.rows;
        console.log('✅ Teste 1 - Total agendas na tabela AGENDA:', rows1[0].TOTAL);
        
        // Teste 2: Total na view DC_CHAT_AGENDAS
        const q2 = `SELECT COUNT(*) as TOTAL FROM DC_CHAT_AGENDAS WHERE CD_AGENDA IN (SELECT cd_agenda FROM agenda WHERE cd_pessoa_fisica = 297 AND IE_SITUACAO = 'A' AND CD_TIPO_AGENDA = 3)`;
        const r2 = await db.oracle.raw(q2);
        const rows2 = Array.isArray(r2) ? r2 : r2.rows;
        console.log('✅ Teste 2 - Total na view DC_CHAT_AGENDAS:', rows2[0].TOTAL);
        
        // Teste 3: Buscar consultas reais
        const q3 = `
            SELECT 
                NR_SEQUENCIA, HR_AGENDA, NM_PACIENTE, DS_STATUS_AGENDA, DT_AGENDA
            FROM DC_CHAT_AGENDAS
            WHERE CD_AGENDA IN (
                SELECT cd_agenda FROM agenda 
                WHERE cd_pessoa_fisica = 297 
                AND IE_SITUACAO = 'A' 
                AND CD_TIPO_AGENDA = 3
            )
            ORDER BY DT_AGENDA DESC, HR_AGENDA
        `;
        const r3 = await db.oracle.raw(q3);
        const rows3 = Array.isArray(r3) ? r3 : r3.rows;
        console.log(`\n✅ Teste 3 - Consultas encontradas: ${rows3.length}\n`);
        
        if (rows3.length > 0) {
            console.log('📋 Primeiras 5 consultas:');
            rows3.slice(0, 5).forEach((c, i) => {
                const data = c.DT_AGENDA ? c.DT_AGENDA.toISOString().split('T')[0] : 'S/data';
                console.log(`   ${i + 1}. ${data} ${c.HR_AGENDA} - ${c.NM_PACIENTE} [${c.DS_STATUS_AGENDA}]`);
            });
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

test();
