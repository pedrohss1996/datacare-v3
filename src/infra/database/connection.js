// ARQUIVO: src/infra/database/connection.js
const knex = require('knex');
const configuration = require('../../../knexfile'); 

// Detecta se está na Railway (production) ou no seu PC (development)
const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development';

// 1. Conexão da Aplicação (Postgres - Usuários, Configs, Dashboards)
const dbApp = knex(configuration[environment]);

// 2. Conexão do Hospital (Oracle - Dados do Tasy)
// Nota: Se não tiver configurado no .env ainda, ele vai dar erro só quando tentar usar.
const dbOracle = knex(configuration.oracleConnection);

// Exporta as duas conexões de forma nomeada
module.exports = { dbApp, dbOracle };