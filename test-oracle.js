// test-oracle.js
const knex = require('knex');
require('dotenv').config();

const testDb = knex({
  client: 'oracledb',
  connection: {
    host: process.env.ORACLE_HOST,
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: `${process.env.ORACLE_HOST}:${process.env.ORACLE_PORT}/${process.env.ORACLE_DATABASE}`
  }
});

async function validarConexao() {
  console.log('--- Iniciando Teste de Conexão Oracle ---');
  try {
    // Uma query simples que funciona em qualquer Oracle (Dual)
    const result = await testDb.raw('SELECT sysdate AS data_atual FROM dual');
    
    console.log('✅ SUCESSO! Conexão estabelecida.');
    console.log('Data do Servidor Oracle:', result[0].DATA_ATUAL);
    
  } catch (err) {
    console.error('❌ ERRO DE CONEXÃO:');
    console.error(err.message);
    
    if (err.message.includes('DPI-1047')) {
        console.log('\n💡 DICA SENIOR: Você precisa instalar o "Oracle Instant Client" na sua máquina.');
    }
  } finally {
    await testDb.destroy();
    process.exit();
  }
}

validarConexao();