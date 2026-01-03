// knexfile.js
require('dotenv').config();

module.exports = {
  // Ambiente de Desenvolvimento (Seu PC conectando na Railway)
  development: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL, // Pega do arquivo .env
      ssl: { rejectUnauthorized: false } // <--- OBRIGATÓRIO: Permite conectar na nuvem
    },
    pool: { min: 2, max: 10 },
    migrations: {
      directory: './src/infra/database/migrations',
      tableName: 'knex_migrations'
    }
  },

  // Ambiente de Produção (Quando o código estiver rodando lá na Railway)
  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    },
    pool: { min: 2, max: 10 },
    migrations: {
      directory: './src/infra/database/migrations',
      tableName: 'knex_migrations'
    }
  },

  oracleConnection: {
    client: 'oracledb',
    connection: {
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONN_STR // ex: "192.168.0.1:1521/TASY"
    },
    pool: { min: 0, max: 5 } // Pool controlado para não travar o Tasy
  }
};