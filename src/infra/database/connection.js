// ARQUIVO: src/infra/database/connection.js
const knex = require('knex');
const configuration = require('../../../knexfile'); 

// Detecta ambiente
const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development';

// 1. Inicializa a Conexão Principal (Postgres)
const connection = knex(configuration[environment]);

// 2. Inicializa a Conexão Oracle (Opcional por enquanto)
// Verificamos se existe a config para não dar erro se você ainda não configurou o Oracle
let dbOracle = null;
if (configuration.oracleConnection) {
    dbOracle = knex(configuration.oracleConnection);
}

// --- O PULO DO GATO ---
// Exportamos a conexão principal DIRETAMENTE para funcionar com "const db = require(...)"
// E penduramos o Oracle nela para usar depois como "db.oracle"
connection.oracle = dbOracle;

module.exports = connection;