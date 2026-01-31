/**
 * Script de Teste: Buscar agendas por CD_MEDICO
 * 
 * USO:
 * node scripts/test-agenda-cd-medico.js <cd_medico> [data]
 * 
 * EXEMPLO:
 * node scripts/test-agenda-cd-medico.js 12345
 * node scripts/test-agenda-cd-medico.js 12345 2026-01-30
 */

require('dotenv').config();
const db = require('../src/infra/database/connection');

// Função auxiliar para padronizar retorno do Oracle
function getRows(result) {
    if (!result) return [];
    return Array.isArray(result) ? result : (result.rows || []);
}

async function testarAgenda() {
    const cdMedico = process.argv[2];
    const dataFiltro = process.argv[3] || new Date().toISOString().split('T')[0];

    if (!cdMedico) {
        console.error('❌ Uso: node scripts/test-agenda-cd-medico.js <cd_medico> [data]');
        console.error('   Exemplo: node scripts/test-agenda-cd-medico.js 12345 2026-01-30');
        process.exit(1);
    }

    try {
        console.log(`\n🔍 Testando busca de agendas`);
        console.log(`   CD_MEDICO: ${cdMedico}`);
        console.log(`   Data: ${dataFiltro}\n`);

        // Teste 1: Verificar se o médico existe e tem agendas
        console.log('📊 TESTE 1: Verificando agendas do médico no TASY...');
        
        const queryTest1 = `
            SELECT COUNT(*) as TOTAL_AGENDAS
            FROM agenda
            WHERE cd_pessoa_fisica = :cd_pessoa_fisica
              AND IE_SITUACAO = 'A'
              AND CD_TIPO_AGENDA = 3
        `;

        const result1 = await db.oracle.raw(queryTest1, { cd_pessoa_fisica: parseInt(cdMedico) });
        const rows1 = getRows(result1);
        
        console.log(`   Total de agendas (todos os períodos): ${rows1[0]?.TOTAL_AGENDAS || 0}`);

        // Teste 2: Verificar agendas do dia
        console.log('\n📊 TESTE 2: Verificando agendas do dia específico...');
        
        const queryTest2 = `
            SELECT COUNT(*) as TOTAL_AGENDAS_DIA
            FROM agenda
            WHERE cd_pessoa_fisica = :cd_pessoa_fisica
              AND IE_SITUACAO = 'A'
              AND CD_TIPO_AGENDA = 3
              AND TRUNC(dt_agenda) = TO_DATE(:dt_agenda, 'YYYY-MM-DD')
        `;

        const result2 = await db.oracle.raw(queryTest2, { 
            cd_pessoa_fisica: parseInt(cdMedico),
            dt_agenda: dataFiltro
        });
        const rows2 = getRows(result2);
        
        console.log(`   Total de agendas do dia ${dataFiltro}: ${rows2[0]?.TOTAL_AGENDAS_DIA || 0}`);

        // Teste 3: Buscar na view DC_CHAT_AGENDAS (query real da aplicação)
        console.log('\n📊 TESTE 3: Buscando na view DC_CHAT_AGENDAS (query da aplicação)...');
        
        const queryReal = `
            SELECT 
                NR_SEQUENCIA AS ID_AGENDA,
                HR_AGENDA AS HORA,
                IE_STATUS_AGENDA AS STATUS,
                DS_STATUS_AGENDA AS STATUS_DESC,
                NM_PACIENTE AS NOME_PACIENTE,
                CD_CONVENIO AS COD_CONVENIO,
                DS_CONVENIO AS CONVENIO,
                DT_AGENDA AS DATA_AGENDA,
                CD_AGENDA AS CD_AGENDA
            FROM DC_CHAT_AGENDAS
            WHERE CD_AGENDA IN (
                SELECT cd_agenda 
                FROM agenda 
                WHERE cd_pessoa_fisica = :cd_pessoa_fisica
                AND IE_SITUACAO = 'A' 
                AND CD_TIPO_AGENDA = 3
            )
            AND TRUNC(DT_AGENDA) = TO_DATE(:dt_agenda, 'YYYY-MM-DD')
            ORDER BY HR_AGENDA
        `;

        const resultReal = await db.oracle.raw(queryReal, { 
            cd_pessoa_fisica: parseInt(cdMedico),
            dt_agenda: dataFiltro
        });
        const consultas = getRows(resultReal);
        
        console.log(`   ✅ Consultas encontradas: ${consultas.length}`);

        if (consultas.length > 0) {
            console.log('\n📋 Primeiras 5 consultas:');
            consultas.slice(0, 5).forEach((c, i) => {
                console.log(`   ${i + 1}. ${c.HORA} - ${c.NOME_PACIENTE} [${c.STATUS_DESC}]`);
            });
        } else {
            console.log('\n⚠️  Nenhuma consulta encontrada!');
            console.log('\n💡 Possíveis causas:');
            console.log('   1. CD_MEDICO incorreto');
            console.log('   2. Não há agendas para esta data');
            console.log('   3. View DC_CHAT_AGENDAS está desatualizada');
            console.log('   4. Agendas não estão com IE_SITUACAO = \'A\'');
        }

        // Teste 4: Verificar se o usuário está vinculado corretamente
        console.log('\n📊 TESTE 4: Verificando vínculo no DataCare...');
        
        const usuarios = await db('usuarios')
            .where('cd_medico_tasy', parseInt(cdMedico))
            .select('cd_usuario', 'nm_usuario', 'ds_usuario', 'cd_medico_tasy');

        if (usuarios.length > 0) {
            console.log(`   ✅ Usuários vinculados a este CD_MEDICO:`);
            usuarios.forEach(u => {
                console.log(`      - ${u.nm_usuario} (${u.ds_usuario || 'Sem nome'}) - ID: ${u.cd_usuario}`);
            });
        } else {
            console.log(`   ⚠️  Nenhum usuário vinculado ao CD_MEDICO ${cdMedico}`);
        }

        console.log('\n✅ Teste concluído!\n');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Erro durante o teste:', error.message);
        console.error('\nDetalhes:', error);
        process.exit(1);
    }
}

testarAgenda();
