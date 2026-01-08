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
      host: process.env.ORACLE_HOST || 'seu_ip_oracle',
      user: process.env.ORACLE_USER || 'seu_usuario',
      password: process.env.ORACLE_PASSWORD || 'sua_senha',
      database: process.env.ORACLE_DATABASE || 'xe', // SID ou Service Name
      // Se precisar de String de Conexão completa (comum no Tasy/Oracle):
      connectString: `${process.env.ORACLE_HOST}:${process.env.ORACLE_PORT}/${process.env.ORACLE_DATABASE}`
    },
    pool: {
      min: 0, // <--- O SEGREDO: Permite esvaziar a piscina se estiver ocioso
      max: 7, 
      // Tempo (ms) antes de destruir uma conexão ociosa (ex: 60 segundos)
      // Se o firewall corta em 10min, coloque isso em 5min.
      idleTimeoutMillis: 180000, 
      
      // (Opcional) Validação extra: Testa a conexão antes de emprestar
      // Isso garante que nunca entregamos uma conexão quebrada pro usuário
      validate: (conn) => {
        return conn.execute('SELECT 1 FROM DUAL')
          .then(() => true)
          .catch(() => false);
      }
    },
    fetchAsString: ['number', 'clob'], 
  }
};