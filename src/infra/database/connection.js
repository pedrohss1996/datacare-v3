const knex = require('knex');
const configuration = require('../../../knexfile'); // Volta 3 pastas para achar o knexfile na raiz

// Define qual ambiente usar (se estiver no Railway usa 'production', se for local usa 'development')
const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development';

// Cria a conexão usando as configurações daquele ambiente
const connection = knex(configuration[environment]);

module.exports = connection;