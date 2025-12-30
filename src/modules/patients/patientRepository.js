const db = require('../../infra/database/connection');

module.exports = {
    async create(data) {
        // O Postgres retorna o dado inserido com 'returning'
        // O MariaDB/MySQL retorna o ID de outra forma. 
        // O Knex abstrai isso, mas vamos fazer simples:
        return db('patients').insert(data);
    }
};