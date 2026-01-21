// Script de teste para verificar conexão Oracle e formato de retorno
require('dotenv').config();
const db = require('./src/infra/database/connection');

async function testarOracle() {
    console.log('🔍 Testando Conexão Oracle...\n');
    
    // Query simples de teste
    const queryTeste = `
        SELECT 
            'Janeiro' AS MES,
            100 AS TOTAL,
            50 AS MEDIA
        FROM DUAL
        UNION ALL
        SELECT 'Fevereiro', 150, 75 FROM DUAL
        UNION ALL
        SELECT 'Março', 200, 100 FROM DUAL
    `;

    try {
        console.log('📊 Query:', queryTeste.trim());
        console.log('\n⏳ Executando...\n');
        
        // Testa se Oracle está disponível
        if (!db.oracle) {
            console.error('❌ ERRO: db.oracle não está configurado!');
            console.log('💡 Verifique o arquivo knexfile.js e as variáveis de ambiente ORACLE_*');
            process.exit(1);
        }

        const result = await db.oracle.raw(queryTeste);
        
        console.log('✅ Query executada com sucesso!\n');
        console.log('📦 Tipo do resultado:', typeof result);
        console.log('📦 É Array?', Array.isArray(result));
        console.log('📦 Keys do resultado:', Object.keys(result));
        console.log('\n📄 Resultado completo:');
        console.log(JSON.stringify(result, null, 2));
        
        // Tenta extrair dados nos formatos comuns
        let data = [];
        
        if (result.rows && Array.isArray(result.rows)) {
            console.log('\n✅ Formato: result.rows (oracledb driver)');
            data = result.rows;
        } else if (Array.isArray(result[0])) {
            console.log('\n✅ Formato: result[0] (Knex com Oracle)');
            data = result[0];
        } else if (Array.isArray(result)) {
            console.log('\n✅ Formato: result direto (Array)');
            data = result;
        } else {
            console.log('\n⚠️  Formato desconhecido!');
        }
        
        console.log('\n📊 Dados extraídos:');
        console.log(`   Total de registros: ${data.length}`);
        if (data.length > 0) {
            console.log('   Primeiro registro:', data[0]);
            console.log('   Colunas:', Object.keys(data[0]));
        }
        
        console.log('\n✅ TESTE CONCLUÍDO COM SUCESSO!');
        
    } catch (error) {
        console.error('\n❌ ERRO ao executar query:');
        console.error('   Mensagem:', error.message);
        console.error('   Stack:', error.stack);
    } finally {
        // Fecha as conexões
        try {
            if (db.oracle) await db.oracle.destroy();
            await db.destroy();
            console.log('\n🔌 Conexões fechadas.');
        } catch (e) {
            console.error('Erro ao fechar conexões:', e.message);
        }
        process.exit(0);
    }
}

// Executa o teste
testarOracle();
