/**
 * LargeDatasetHandler - Gerencia queries com milhões de registros
 * Estratégias: Streaming, Cache, Validação de Filtros, Paginação Virtual
 */

const QueryStreamer = require('./queryStreamer');
const cacheDashboards = require('./cacheDashboards');

/**
 * Valida se a query tem filtros de data (obrigatório para grandes datasets)
 * @param {string} sqlQuery - Query SQL
 * @returns {Object} { hasDateFilter: boolean, dateColumns: string[] }
 */
function validateDateFilters(sqlQuery) {
  const sqlUpper = sqlQuery.toUpperCase();
  
  // Padrões de colunas de data comuns no Tasy
  const datePatterns = [
    /DT_ENTRADA/i,
    /DT_ALTA/i,
    /DT_AGENDA/i,
    /DT_NASCIMENTO/i,
    /DT_ATUALIZACAO/i,
    /DT_AGENDAMENTO/i,
    /DATA_/i,
    /DATE_/i
  ];
  
  // Verifica se tem WHERE com coluna de data
  const hasDateInWhere = datePatterns.some(pattern => {
    const match = sqlQuery.match(new RegExp(`WHERE.*?${pattern.source.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}`, 'i'));
    return !!match;
  });
  
  // Verifica se tem TRUNC(SYSDATE) ou similar
  const hasDateFunction = /TRUNC\s*\(|SYSDATE|TO_DATE|DATE/i.test(sqlQuery);
  
  // Verifica se tem FETCH FIRST ou ROWNUM (limite)
  const hasLimit = /FETCH\s+FIRST|ROWNUM\s*<=|ROWNUM\s*</i.test(sqlQuery);
  
  const dateColumns = [];
  datePatterns.forEach(pattern => {
    const matches = sqlQuery.match(new RegExp(pattern.source.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'), 'gi'));
    if (matches) dateColumns.push(...matches);
  });
  
  return {
    hasDateFilter: hasDateInWhere || hasDateFunction,
    hasLimit: hasLimit,
    dateColumns: [...new Set(dateColumns)],
    requiresDateFilter: !hasDateInWhere && !hasLimit // Se não tem filtro nem limite, precisa
  };
}

/**
 * Executa query com streaming progressivo para grandes datasets
 * @param {Object} connection - Conexão Knex
 * @param {string} sqlQuery - Query SQL
 * @param {Object} options - { maxRows, batchSize, onProgress }
 * @returns {Promise<Array>} Dados completos
 */
async function executeLargeQuery(connection, sqlQuery, options = {}) {
  const {
    maxRows = 500000,      // Máximo de 500k registros
    batchSize = 10000,     // 10k por batch
    onProgress = null,      // Callback de progresso
    cacheKey = null,       // Chave para cache
    cacheTTL = 3600000     // 1 hora de cache
  } = options;
  
  // Verifica cache primeiro
  if (cacheKey) {
    const cached = cacheDashboards.get(cacheKey);
    if (cached) {
      console.log(`✅ [LargeDataset] Cache hit: ${cached.length} registros`);
      return cached;
    }
  }
  
  // Valida filtros de data (apenas aviso, não bloqueia)
  const validation = validateDateFilters(sqlQuery);
  if (validation.requiresDateFilter) {
    console.warn('⚠️ [LargeDataset] Query sem filtro de data detectada. Recomendado adicionar filtro de data para melhor performance.');
    // Não bloqueia, apenas avisa - o controller já adiciona limite de segurança
  }
  
  console.log(`🌊 [LargeDataset] Executando query grande (máx ${maxRows} registros)...`);
  
  const allData = [];
  let totalProcessed = 0;
  let batchNum = 0;
  const startTime = Date.now();
  
  try {
    // Usa batch mode para grandes datasets
    const maxBatches = Math.ceil(maxRows / batchSize);
    
    let offset = 0;
    let hasMore = true;
    
    while (hasMore && batchNum < maxBatches) {
      batchNum++;
      
      // Modifica query para adicionar OFFSET/FETCH
      let batchQuery = sqlQuery.trim().replace(/;?\s*$/, '');
      
      // Remove FETCH existente
      batchQuery = batchQuery.replace(/FETCH\s+FIRST\s+\d+\s+ROWS\s+ONLY/gi, '');
      batchQuery = batchQuery.replace(/ROWNUM\s*[<>=]\s*\d+/gi, '');
      
      // Adiciona OFFSET/FETCH
      if (!/ORDER\s+BY/i.test(batchQuery)) {
        // Se não tem ORDER BY, adiciona um genérico (necessário para OFFSET)
        const firstCol = batchQuery.match(/SELECT\s+(\w+)/i);
        if (firstCol) {
          batchQuery += ` ORDER BY ${firstCol[1]}`;
        }
      }
      
      batchQuery += ` OFFSET ${offset} ROWS FETCH NEXT ${batchSize} ROWS ONLY`;
      
      console.log(`📦 [LargeDataset] Batch ${batchNum}: offset ${offset}, fetch ${batchSize}`);
      
      const result = await connection.raw(batchQuery);
      
      // Extrai dados
      let batchData = [];
      if (result.rows && Array.isArray(result.rows)) {
        batchData = result.rows;
      } else if (Array.isArray(result[0])) {
        batchData = result[0];
      } else if (Array.isArray(result)) {
        batchData = result;
      }
      
      // Transforma strings numéricas
      batchData = batchData.map(row => {
        const newRow = {};
        for (const [key, value] of Object.entries(row)) {
          if (typeof value === 'string' && !isNaN(value) && value.trim() !== '') {
            newRow[key] = parseFloat(value);
          } else {
            newRow[key] = value;
          }
        }
        return newRow;
      });
      
      allData.push(...batchData);
      totalProcessed += batchData.length;
      
      // Callback de progresso
      if (onProgress) {
        onProgress({
          batchNum,
          batchSize: batchData.length,
          totalProcessed,
          progress: Math.min(100, (totalProcessed / maxRows) * 100)
        });
      }
      
      console.log(`✅ [LargeDataset] Batch ${batchNum}: ${batchData.length} registros (total: ${totalProcessed})`);
      
      // Se retornou menos que batchSize, acabou
      if (batchData.length < batchSize) {
        hasMore = false;
        console.log(`🏁 [LargeDataset] Último batch alcançado`);
      }
      
      offset += batchSize;
      
      // Proteção: não excede maxRows
      if (totalProcessed >= maxRows) {
        console.warn(`⚠️ [LargeDataset] Limite de ${maxRows} registros atingido`);
        break;
      }
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`✅ [LargeDataset] Completo: ${totalProcessed} registros em ${batchNum} batches (${elapsed}ms)`);
    
    // Salva no cache
    if (cacheKey && allData.length > 0) {
      cacheDashboards.set(cacheKey, allData, cacheTTL);
      console.log(`💾 [LargeDataset] Dados salvos no cache (${allData.length} registros)`);
    }
    
    return allData;
    
  } catch (error) {
    console.error('❌ [LargeDataset] Erro:', error.message);
    throw error;
  }
}

/**
 * Gera chave de cache baseada na query e parâmetros
 */
function generateCacheKey(sqlQuery, params = {}) {
  const crypto = require('crypto');
  const queryHash = crypto.createHash('md5').update(sqlQuery + JSON.stringify(params)).digest('hex');
  return `large_query_${queryHash}`;
}

module.exports = {
  validateDateFilters,
  executeLargeQuery,
  generateCacheKey
};
