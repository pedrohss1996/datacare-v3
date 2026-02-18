/**
 * Oracle Stream Service - Streaming de dados com oracledb.queryStream
 * Mantém consumo de memória constante mesmo com centenas de milhares de registros.
 * Evita OOM em containers Docker.
 */

const oracledb = require('oracledb');

function getOracleConfig() {
  const host = process.env.ORACLE_HOST || 'localhost';
  const port = process.env.ORACLE_PORT || '1521';
  const database = process.env.ORACLE_DATABASE || 'xe';
  return {
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING || `${host}:${port}/${database}`,
    fetchArraySize: 500
  };
}

/** Verifica se Oracle está configurado */
function isOracleConfigured() {
  const c = getOracleConfig();
  return !!(c.user && c.password);
}

/**
 * Transforma valor para JSON (oracledb retorna tipos especiais)
 */
function sanitizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v && typeof v === 'object' && typeof v.toISOString === 'function') {
      out[k] = v.toISOString();
    } else if (v != null && typeof v !== 'function') {
      const s = String(v);
      if (typeof v === 'string' && s !== '' && !isNaN(parseFloat(s)) && /^-?\d+(\.\d+)?$/.test(s)) {
        out[k] = parseFloat(s);
      } else {
        out[k] = v;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Streama resultados Oracle para a resposta HTTP em chunks.
 * Formato NDJSON: cada linha é um JSON válido.
 * Linha 1: {"type":"header","success":true,"biConfig":{...},"columns":[...]}
 * Linhas 2+: {"type":"row","data":{...}}
 * Última: {"type":"end","total":N}
 *
 * @param {Object} options - { sqlQuery, biConfig, columns, res, fetchArraySize }
 */
async function streamToResponse(options) {
  const { sqlQuery, biConfig, columns, res, fetchArraySize = 500 } = options;

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders && res.flushHeaders();

  const writeLine = (obj) => res.write(JSON.stringify(obj) + '\n');

  let connection;
  try {
    const config = getOracleConfig();
    if (!config.user || !config.password) {
      writeLine({ type: 'error', success: false, message: 'Oracle não configurado (ORACLE_USER/ORACLE_PASSWORD)' });
      res.end();
      return;
    }

    connection = await oracledb.getConnection(config);

    writeLine({
      type: 'header',
      success: true,
      biConfig,
      columns: columns || []
    });

    const stream = connection.queryStream(
      sqlQuery,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize }
    );

    let totalRows = 0;
    const streamPromise = new Promise((resolve, reject) => {
      stream.on('data', (row) => {
        totalRows++;
        writeLine({ type: 'row', data: sanitizeRow(row) });
      });
      stream.on('end', () => stream.destroy());
      stream.on('close', () => resolve(totalRows));
      stream.on('error', reject);
    });

    await streamPromise;
    writeLine({ type: 'end', total: totalRows });
  } catch (err) {
    console.error('❌ [OracleStream]', err.message);
    writeLine({ type: 'error', success: false, message: err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (e) {
        console.error('❌ [OracleStream] Erro ao fechar conexão:', e.message);
      }
    }
    res.end();
  }
}

module.exports = { streamToResponse, getOracleConfig, isOracleConfigured };
