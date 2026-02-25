/**
 * Serviço de conexão Oracle - pool por conexão cadastrada.
 * Usa oracledb nativo (não knex) para controle fino.
 */
const oracledb = require('oracledb');
const { decryptPassword } = require('../utils/encrypt');

/** 0 = sem limite (todas as linhas). Para preview use um número (ex: 100). */
const PREVIEW_ROWS = 100;

/**
 * Monta config oracledb a partir de um registro ai_oracle_connections.
 * @param {Object} conn - { id, host, port, service_name, username, password_encrypted }
 * @returns {Object} config para oracledb.getConnection
 */
function getOracleConfig(conn) {
  const password = decryptPassword(conn.password_encrypted || '');
  const connectString = `${conn.host}:${conn.port || 1521}/${conn.service_name}`;
  return {
    user: conn.username,
    password,
    connectString,
    fetchArraySize: 500,
  };
}

/**
 * Executa uma query SELECT no Oracle e retorna linhas.
 * @param {Object} connRecord - registro de ai_oracle_connections
 * @param {string} sql - query SELECT validada
 * @param {number} [limit=0] - 0 = sem limite (todas as linhas); use número para limitar (ex: 100 para preview)
 * @returns {Promise<{ rows: Array<Object>, meta: { columns: Array<{name:string, type:string}> }>}
 */
async function executeQuery(connRecord, sql, limit = 0) {
  const config = getOracleConfig(connRecord);
  const connection = await oracledb.getConnection(config);
  try {
    const result = await connection.execute(
      sql,
      [],
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        maxRows: limit,
        fetchArraySize: 500,
      }
    );
    const rows = result.rows || [];
    const metaData = result.metaData || result.meta || [];
    const columns = metaData.map((m) => ({
      name: m.name,
      type: (m.dbTypeName || m.fetchTypeName || '').toString().toLowerCase(),
    }));
    if (columns.length === 0 && rows.length > 0 && typeof rows[0] === 'object') {
      Object.keys(rows[0]).forEach((key) => columns.push({ name: key, type: 'string' }));
    }
    return { rows, meta: { columns } };
  } finally {
    await connection.close();
  }
}

/**
 * Testa conectividade (SELECT 1 FROM DUAL).
 * @param {Object} connRecord
 * @returns {Promise<boolean>}
 */
async function testConnection(connRecord) {
  const config = getOracleConfig(connRecord);
  const connection = await oracledb.getConnection(config);
  try {
    await connection.execute('SELECT 1 FROM DUAL');
    return true;
  } finally {
    await connection.close();
  }
}

module.exports = { getOracleConfig, executeQuery, testConnection, PREVIEW_ROWS };
