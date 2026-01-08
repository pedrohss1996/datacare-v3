// fix_knex.js
const db = require('./src/infra/database/connection');

async function limparMemoriaKnex() {
    try {
        console.log('Tentando corrigir histórico de migrações...');
        
        // Remove o registro do arquivo fantasma
        await db('knex_migrations')
            .where('name', '20251230004444_create_patients_table.js')
            .del();

        console.log('✅ Sucesso! O registro fantasma foi removido.');
        console.log('Agora você pode rodar o comando de migrate novamente.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

limparMemoriaKnex();