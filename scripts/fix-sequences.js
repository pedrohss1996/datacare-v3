// Script para corrigir sequences do PostgreSQL
// Uso: node scripts/fix-sequences.js

require('dotenv').config();
const db = require('../src/infra/database/connection');

async function fixSequences() {
    try {
        console.log('🔧 Corrigindo sequences do banco de dados...\n');

        // Lista de tabelas com suas colunas de ID
        const tabelas = [
            { tabela: 'pessoa_fisica', coluna: 'cd_pessoa_fisica' },
            { tabela: 'usuarios', coluna: 'cd_usuario' }
        ];

        for (const { tabela, coluna } of tabelas) {
            console.log(`📋 Tabela: ${tabela}`);
            
            // Busca o máximo ID atual
            const maxResult = await db(tabela).max(coluna).first();
            const maxId = maxResult[`max`] || 0;
            console.log(`   Max ID atual: ${maxId}`);

            // Busca o nome da sequence
            const sequenceQuery = `
                SELECT pg_get_serial_sequence('${tabela}', '${coluna}') as seq_name
            `;
            const seqResult = await db.raw(sequenceQuery);
            const sequenceName = seqResult.rows[0]?.seq_name;

            if (sequenceName) {
                console.log(`   Sequence: ${sequenceName}`);

                // Corrige a sequence
                const nextVal = maxId + 1;
                await db.raw(`SELECT setval('${sequenceName}', ${nextVal}, false)`);
                
                // Verifica o novo valor
                const checkResult = await db.raw(`SELECT last_value FROM ${sequenceName}`);
                const newValue = checkResult.rows[0]?.last_value;
                
                console.log(`   ✅ Sequence ajustada para: ${newValue}`);
                console.log(`   Próximo ID será: ${nextVal}\n`);
            } else {
                console.log(`   ⚠️  Sequence não encontrada\n`);
            }
        }

        console.log('✅ Todas as sequences foram corrigidas!\n');
        console.log('Agora você pode criar novos usuários normalmente.');
        
        process.exit(0);

    } catch (error) {
        console.error('❌ Erro ao corrigir sequences:', error.message);
        console.error(error);
        process.exit(1);
    }
}

fixSequences();
