/**
 * Dataset Engine - Executa query no Oracle, cria tabela ai_dataset_{id} no PostgreSQL,
 * insere em batch e cria índices automáticos (date, numeric, primeiras 2 colunas).
 */
const db = require('../../../infra/database/connection');
const { validateSQL } = require('../utils/validateSQL');
const oracleService = require('../oracle/oracle.service');

const BATCH_SIZE = 500;
const PREVIEW_LIMIT = 100;

/**
 * Mapeia tipo Oracle aproximado para tipo PostgreSQL.
 */
function mapOracleToPgType(oracleType) {
  const t = (oracleType || '').toLowerCase();
  if (t.includes('date') || t.includes('timestamp')) return 'timestamp';
  if (t.includes('number') || t.includes('int') || t.includes('float')) return 'numeric';
  return 'text';
}

/**
 * Nome seguro para coluna (identifier).
 */
function safeColumnName(name) {
  return String(name).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^([0-9])/, '_$1') || 'col';
}

/**
 * Nome da tabela física do dataset.
 */
function tableName(datasetId) {
  const clean = String(datasetId).replace(/-/g, '_');
  return `ai_dataset_${clean}`;
}

/**
 * Cria tabela ai_dataset_{id}, insere dados em batch, cria índices.
 */
async function createTableAndInsert(datasetId, rows, columns) {
  const tbl = tableName(datasetId);

  await db.transaction(async (trx) => {
    await trx.raw(`DROP TABLE IF EXISTS "${tbl}"`);
    const colDefs = columns.map((c) => {
      const safe = safeColumnName(c.name);
      const pgType = mapOracleToPgType(c.type);
      return `"${safe}" ${pgType}`;
    });
    await trx.raw(`CREATE TABLE "${tbl}" (_row_id SERIAL PRIMARY KEY, ${colDefs.join(', ')})`);

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const insertRows = batch.map((row) => {
        const obj = {};
        columns.forEach((c) => {
          const safe = safeColumnName(c.name);
          let val = row[c.name] ?? row[safe];
          if (val != null && typeof val === 'object' && typeof val.toISOString === 'function') {
            val = val.toISOString();
          }
          obj[safe] = val;
        });
        return obj;
      });
      await trx(tbl).insert(insertRows);
    }

    const dateCols = columns.filter((c) => /date|timestamp|dt_|data/i.test(c.name || ''));
    const numericCols = columns.filter((c) => /number|numeric|int|float|vl_|qtd|nr_/i.test(c.type || '') || /vl_|qtd|nr_/i.test(c.name || ''));
    const firstTwo = columns.slice(0, 2).map((c) => safeColumnName(c.name));

    for (const c of dateCols) {
      const safe = safeColumnName(c.name);
      await trx.raw(`CREATE INDEX IF NOT EXISTS "idx_${tbl}_${safe}" ON "${tbl}" ("${safe}")`).catch(() => {});
    }
    for (const c of numericCols) {
      const safe = safeColumnName(c.name);
      await trx.raw(`CREATE INDEX IF NOT EXISTS "idx_${tbl}_${safe}" ON "${tbl}" ("${safe}")`).catch(() => {});
    }
    if (firstTwo.length >= 2) {
      await trx.raw(`CREATE INDEX IF NOT EXISTS "idx_${tbl}_first2" ON "${tbl}" ("${firstTwo[0]}", "${firstTwo[1]}")`).catch(() => {});
    } else if (firstTwo.length === 1) {
      await trx.raw(`CREATE INDEX IF NOT EXISTS "idx_${tbl}_first" ON "${tbl}" ("${firstTwo[0]}")`).catch(() => {});
    }
  });
}

/**
 * Executa dataset: busca dataset, valida SQL, conecta Oracle, executa, persiste no PG.
 * A SQL é executada EXATAMENTE como cadastrada — nenhuma modificação é feita.
 */
async function executeDataset(datasetId) {
  const dataset = await db('ai_datasets').where({ id: datasetId }).first();
  if (!dataset) throw new Error('Dataset não encontrado.');

  const validation = validateSQL(dataset.sql_original);
  if (!validation.valid) throw new Error(validation.error);

  const conn = await db('ai_oracle_connections').where({ id: dataset.oracle_connection_id }).first();
  if (!conn) throw new Error('Conexão Oracle não encontrada.');

  console.log(`[AI-Dataset] Executando SQL no Oracle (dataset="${dataset.name}", id=${datasetId})`);
  console.log(`[AI-Dataset] SQL exata:\n${dataset.sql_original}`);

  const { rows, meta } = await oracleService.executeQuery(conn, dataset.sql_original, 0);
  if (!meta.columns || meta.columns.length === 0) throw new Error('Nenhuma coluna retornada pela query.');

  console.log(`[AI-Dataset] Oracle retornou: ${rows.length} registros, ${meta.columns.length} colunas`);

  const columns = meta.columns.map((c) => ({ name: c.name, type: c.type || 'string' }));

  await createTableAndInsert(datasetId, rows, columns);

  await db('ai_datasets').where({ id: datasetId }).update({
    last_execution: db.fn.now(),
  });

  console.log(`[AI-Dataset] Armazenados no PostgreSQL: ${rows.length} registros → tabela "${tableName(datasetId)}"`);

  return { rowsCount: rows.length, tableName: tableName(datasetId), oracleRows: rows.length };
}

/**
 * Retorna estrutura (colunas e tipos) da tabela ai_dataset_{id}.
 */
async function getDatasetStructure(datasetId) {
  const tbl = tableName(datasetId);
  const raw = await db.raw(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ? AND table_schema = 'public' ORDER BY ordinal_position`,
    [tbl]
  );
  const rows = raw.rows || raw;
  if (!rows.length) return [];
  return rows.map((r) => ({
    name: r.column_name,
    type: (r.data_type || 'text').toLowerCase(),
  }));
}

/**
 * Lê dados da tabela local (PostgreSQL) para o dashboard.
 * limit = 0 ou não informado: retorna todos os registros. limit > 0: aplica limite.
 */
async function getDatasetData(datasetId, limit = 0) {
  const tbl = tableName(datasetId);
  let builder = db(tbl).select('*');
  if (limit > 0) builder = builder.limit(limit);
  return await builder;
}

/**
 * Preview: executa a query no Oracle com limite (sem salvar no PG).
 * Por dataset id (já salvo) ou por conexão + sql (ad-hoc no modal).
 */
async function previewQuery(datasetIdOrNull, oracleConnectionId, sql, limit = PREVIEW_LIMIT) {
  let dataset;
  let conn;
  let sqlToRun = sql;
  if (datasetIdOrNull) {
    dataset = await db('ai_datasets').where({ id: datasetIdOrNull }).first();
    if (!dataset) throw new Error('Dataset não encontrado.');
    conn = await db('ai_oracle_connections').where({ id: dataset.oracle_connection_id }).first();
    sqlToRun = dataset.sql_original;
  } else {
    if (!oracleConnectionId || !sqlToRun) throw new Error('Selecione a conexão e informe a query para o preview.');
    conn = await db('ai_oracle_connections').where({ id: oracleConnectionId }).first();
    if (!conn) throw new Error('Conexão não encontrada.');
  }
  const validation = validateSQL(sqlToRun);
  if (!validation.valid) throw new Error(validation.error);
  const { rows, meta } = await oracleService.executeQuery(conn, sqlToRun, limit);
  const columns = (meta.columns || []).length ? meta.columns : (rows[0] ? Object.keys(rows[0]).map((k) => ({ name: k, type: 'string' })) : []);
  return { rows, columns };
}

module.exports = {
  executeDataset,
  getDatasetStructure,
  getDatasetData,
  previewQuery,
  tableName,
  BATCH_SIZE,
  PREVIEW_LIMIT,
};
