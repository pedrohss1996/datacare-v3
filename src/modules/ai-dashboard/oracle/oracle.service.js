/**
 * Serviço de conexão Oracle - pool por conexão cadastrada.
 * Usa oracledb nativo (não knex) para controle fino.
 */
const oracledb = require('oracledb');
const { decryptPassword } = require('../utils/encrypt');

/** Linhas por preview (sem execução completa). */
const PREVIEW_ROWS = 100;

/** Tamanho do lote ao buscar rows via ResultSet (performance vs memória). */
const RS_FETCH_SIZE = 2000;

/**
 * Configura parâmetros NLS da sessão Oracle.
 * Necessário para interpretar datas no formato brasileiro (DD/MM/YYYY)
 * passadas diretamente na query, ex.: WHERE dt_consulta > '01/01/2024'.
 *
 * @param {Object} connection - conexão oracledb aberta
 */
async function applyNLSSession(connection) {
  // 'DD/MM/YYYY HH24:MI:SS' cobre tanto datas puras ('01/01/2026') quanto
  // datas com horário ('01/01/2026 00:00:00'). Sem o modificador FX, o Oracle
  // é leniente: se o horário for omitido na string, ele assume 00:00:00.
  await connection.execute(
    `ALTER SESSION SET NLS_DATE_FORMAT = 'DD/MM/YYYY HH24:MI:SS' NLS_TIMESTAMP_FORMAT = 'DD/MM/YYYY HH24:MI:SS'`
  );
}

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
  };
}

/**
 * Extrai colunas dos metadados do ResultSet ou execute result.
 */
function extractColumns(metaData) {
  return (metaData || []).map((m) => ({
    name: m.name,
    type: (m.dbTypeName || m.fetchTypeName || 'string').toString().toLowerCase(),
  }));
}

/**
 * Executa uma query SELECT no Oracle e retorna TODOS os registros.
 *
 * A query SQL é executada EXATAMENTE como fornecida — nenhuma modificação é feita.
 *
 * Para fetch completo (limit = 0): usa ResultSet + getRows() em loop,
 * garantindo que TODOS os registros sejam retornados sem truncamento.
 * Para preview (limit > 0): usa execute() simples com maxRows.
 *
 * @param {Object} connRecord - registro de ai_oracle_connections
 * @param {string} sql - query SELECT exata (não modificada)
 * @param {number} [limit=0] - 0 = todos os registros; > 0 = preview com limite
 * @returns {Promise<{ rows: Array<Object>, meta: { columns: Array<{name:string, type:string}> }}>}
 */
async function executeQuery(connRecord, sql, limit = 0) {
  const config = getOracleConfig(connRecord);
  const connection = await oracledb.getConnection(config);
  try {
    // Garante que datas no formato brasileiro (DD/MM/YYYY) sejam interpretadas corretamente.
    await applyNLSSession(connection);

    let rows = [];
    let columns = [];

    if (limit > 0) {
      // Preview com limite: execute() simples
      const result = await connection.execute(sql, [], {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        maxRows: limit,
        fetchArraySize: Math.min(limit, RS_FETCH_SIZE),
      });
      rows = result.rows || [];
      columns = extractColumns(result.metaData || result.meta || []);
    } else {
      // Fetch completo: ResultSet + getRows() em loop
      // Garante que TODOS os registros sejam retornados sem depender de maxRows.
      const result = await connection.execute(sql, [], {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        resultSet: true,
        fetchArraySize: RS_FETCH_SIZE,
      });
      const rs = result.resultSet;
      columns = extractColumns(rs.metaData || []);
      let batch;
      while ((batch = await rs.getRows(RS_FETCH_SIZE)).length > 0) {
        rows = rows.concat(batch);
      }
      await rs.close();
    }

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
    await applyNLSSession(connection);
    await connection.execute('SELECT 1 FROM DUAL');
    return true;
  } finally {
    await connection.close();
  }
}

module.exports = { getOracleConfig, executeQuery, testConnection, PREVIEW_ROWS };
