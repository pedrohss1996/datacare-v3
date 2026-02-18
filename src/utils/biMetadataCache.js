/**
 * biMetadataCache - Cache de metadados de queries para execução paralela
 * Permite disparar Layout (IA) + Data (Oracle) em paralelo quando o usuário filtrar
 * após já ter carregado o dashboard uma vez.
 */

const crypto = require('crypto');

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutos
const MAX_ENTRIES = 50;

const store = new Map(); // hash -> { columns, sampleData, timestamp, queryHash }

function hashQuery(sql) {
  const normalized = (sql || '').trim().replace(/\s+/g, ' ').toUpperCase();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Salva metadados no cache (colunas + amostra) para reuso em requisições com filtros
 */
function set(sqlQuery, metadata) {
  const key = hashQuery(sqlQuery);
  store.set(key, {
    columns: metadata.columns || [],
    sampleData: metadata.sampleData || [],
    timestamp: Date.now(),
    queryHash: key
  });
  prune();
}

/**
 * Obtém metadados do cache se existirem e não expirados
 */
function get(sqlQuery) {
  const key = hashQuery(sqlQuery);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > DEFAULT_TTL_MS) {
    store.delete(key);
    return null;
  }
  return { columns: entry.columns, sampleData: entry.sampleData };
}

/**
 * Verifica se existe cache válido para a query
 */
function has(sqlQuery) {
  return get(sqlQuery) !== null;
}

function prune() {
  if (store.size <= MAX_ENTRIES) return;
  const entries = Array.from(store.entries())
    .map(([k, v]) => ({ k, ts: v.timestamp }))
    .sort((a, b) => a.ts - b.ts);
  const toRemove = entries.length - MAX_ENTRIES;
  for (let i = 0; i < toRemove; i++) {
    store.delete(entries[i].k);
  }
}

function invalidate(sqlQuery) {
  const key = hashQuery(sqlQuery);
  store.delete(key);
}

function clear() {
  store.clear();
}

function getStats() {
  return { size: store.size, maxEntries: MAX_ENTRIES, ttlMs: DEFAULT_TTL_MS };
}

module.exports = {
  set, get, has, invalidate, clear, getStats, hashQuery
};
