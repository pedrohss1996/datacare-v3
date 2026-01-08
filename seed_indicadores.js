// seed_indicadores.js
const db = require('./src/infra/database/connection');

async function seed() {
    console.log('Inserindo indicadores de teste...');
    try {
        // Limpa anteriores para não duplicar
        await db('config_indicadores').del();

        await db('config_indicadores').insert([
            {
                titulo: 'Total de Pessoas',
                tipo_grafico: 'numero',
                fonte_dados: 'app',
                query_sql: 'SELECT count(*) as valor FROM pessoa_fisica',
                largura: 1, // 1/3 da tela
                ordem: 1,
                cor_base: 'blue'
            },
            {
                titulo: 'Pessoas por Sexo',
                tipo_grafico: 'pizza', // Atenção: requer colunas 'label' e 'valor'
                fonte_dados: 'app',
                query_sql: "SELECT ie_sexo as label, count(*) as valor FROM pessoa_fisica GROUP BY ie_sexo",
                largura: 1,
                ordem: 2,
                cor_base: 'orange'
            }
        ]);
        console.log('✅ Indicadores criados!');
        process.exit();
    } catch(e) { console.error(e); process.exit(1); }
}
seed();