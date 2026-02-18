// ARQUIVO: src/utils/queryStreamer.js
// Sistema de streaming para consultas BI extremamente pesadas

const { Transform } = require('stream');

/**
 * QUERY STREAMER PARA BI PESADO
 * 
 * Para queries que retornam centenas de milhares de registros,
 * faz streaming dos resultados em chunks ao invés de carregar tudo na memória.
 * 
 * Benefícios:
 * - Reduz uso de memória (não carrega 100k registros de uma vez)
 * - Resposta mais rápida (começa a enviar dados antes de terminar)
 * - Previne timeout (processo parcial mesmo se query for lenta)
 */

class QueryStreamer {
  
  /**
   * Executa query em modo streaming
   * 
   * @param {Object} connection - Conexão Knex
   * @param {String} sqlQuery - Query SQL
   * @param {Object} options - Opções
   * @returns {Stream} Stream de dados
   */
  static async streamQuery(connection, sqlQuery, options = {}) {
    const {
      chunkSize = 1000,  // Envia 1000 registros por vez
      onChunk = null,     // Callback para cada chunk
      onComplete = null,  // Callback ao finalizar
      onError = null      // Callback de erro
    } = options;
    
    console.log('🌊 [Query Streamer] Iniciando streaming...');
    console.log(`📦 [Query Streamer] Chunk size: ${chunkSize} registros`);
    
    let totalRows = 0;
    let chunks = 0;
    const startTime = Date.now();
    
    try {
      // Oracle com Knex suporta .stream()
      const stream = await connection.raw(sqlQuery).stream();
      
      const transformStream = new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
          totalRows++;
          
          // Transforma strings numéricas em números
          const transformed = {};
          for (const [key, value] of Object.entries(chunk)) {
            if (typeof value === 'string' && !isNaN(value) && value.trim() !== '') {
              transformed[key] = parseFloat(value);
            } else {
              transformed[key] = value;
            }
          }
          
          this.push(transformed);
          callback();
        }
      });
      
      // Agrupa em chunks antes de enviar
      const buffer = [];
      
      transformStream.on('data', (row) => {
        buffer.push(row);
        
        // Quando completar um chunk, envia
        if (buffer.length >= chunkSize) {
          chunks++;
          const chunk = [...buffer];
          buffer.length = 0; // Limpa buffer
          
          if (onChunk) {
            onChunk(chunk, { totalRows, chunks });
          }
          
          console.log(`📦 [Query Streamer] Chunk ${chunks} enviado (${chunk.length} registros)`);
        }
      });
      
      transformStream.on('end', () => {
        // Envia buffer restante se houver
        if (buffer.length > 0) {
          chunks++;
          if (onChunk) {
            onChunk([...buffer], { totalRows, chunks });
          }
        }
        
        const elapsed = Date.now() - startTime;
        console.log(`✅ [Query Streamer] Finalizado: ${totalRows} registros em ${chunks} chunks (${elapsed}ms)`);
        
        if (onComplete) {
          onComplete({ totalRows, chunks, elapsed });
        }
      });
      
      transformStream.on('error', (error) => {
        console.error('❌ [Query Streamer] Erro:', error.message);
        if (onError) {
          onError(error);
        }
      });
      
      stream.pipe(transformStream);
      
      return transformStream;
      
    } catch (error) {
      console.error('❌ [Query Streamer] Erro ao iniciar stream:', error.message);
      throw error;
    }
  }
  
  /**
   * Executa query em modo batch (para queries muito grandes)
   * 
   * Divide a query em múltiplas execuções menores usando OFFSET/FETCH
   * 
   * @param {Object} connection - Conexão Knex
   * @param {String} sqlQuery - Query SQL (deve ter ORDER BY)
   * @param {Object} options - Opções
   * @returns {Array} Todos os resultados
   */
  static async batchQuery(connection, sqlQuery, options = {}) {
    const {
      batchSize = 5000,    // Busca 5000 registros por vez
      maxBatches = 20,     // Máximo de 20 batches (100k registros total)
      onBatch = null       // Callback para cada batch
    } = options;
    
    console.log('📚 [Query Streamer] Modo batch ativado');
    console.log(`📦 [Query Streamer] Batch size: ${batchSize}, Max batches: ${maxBatches}`);
    
    const allResults = [];
    let offset = 0;
    let batchNum = 0;
    const startTime = Date.now();
    
    try {
      while (batchNum < maxBatches) {
        batchNum++;
        
        // Modifica query para adicionar OFFSET e FETCH
        let batchQuery = sqlQuery.trim().replace(/;$/, '');
        
        // Remove FETCH FIRST existente se houver
        batchQuery = batchQuery.replace(/FETCH FIRST \d+ ROWS ONLY/i, '');
        
        // Adiciona OFFSET e FETCH
        batchQuery = `${batchQuery}\nOFFSET ${offset} ROWS FETCH NEXT ${batchSize} ROWS ONLY`;
        
        console.log(`📦 [Query Streamer] Executando batch ${batchNum} (offset: ${offset})...`);
        
        const result = await connection.raw(batchQuery);
        
        // Extrai dados do resultado
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
        
        console.log(`✅ [Query Streamer] Batch ${batchNum}: ${batchData.length} registros`);
        
        allResults.push(...batchData);
        
        if (onBatch) {
          onBatch(batchData, { batchNum, totalSoFar: allResults.length });
        }
        
        // Se retornou menos que batchSize, acabou
        if (batchData.length < batchSize) {
          console.log(`🏁 [Query Streamer] Último batch alcançado (registros < ${batchSize})`);
          break;
        }
        
        offset += batchSize;
      }
      
      const elapsed = Date.now() - startTime;
      console.log(`✅ [Query Streamer] Batch completo: ${allResults.length} registros em ${batchNum} batches (${elapsed}ms)`);
      
      return allResults;
      
    } catch (error) {
      console.error('❌ [Query Streamer] Erro no batch:', error.message);
      throw error;
    }
  }
  
  /**
   * Decide automaticamente se deve usar streaming, batch ou execução normal
   */
  static async smartExecute(connection, sqlQuery, options = {}) {
    const {
      threshold = 10000,  // Acima de 10k, usa batch
      ...otherOptions
    } = options;
    
    // Tenta estimar quantidade de registros com COUNT
    try {
      // Extrai apenas o FROM...WHERE da query original
      const countQuery = sqlQuery
        .replace(/SELECT.*?FROM/is, 'SELECT COUNT(*) as total FROM')
        .replace(/ORDER BY.*$/is, '')
        .replace(/FETCH.*$/is, '')
        .trim();
      
      console.log('🔍 [Query Streamer] Estimando quantidade de registros...');
      
      const countResult = await connection.raw(countQuery);
      
      let total = 0;
      if (countResult.rows && countResult.rows[0]) {
        total = parseInt(countResult.rows[0].TOTAL || countResult.rows[0].total || 0);
      } else if (Array.isArray(countResult) && countResult[0] && countResult[0][0]) {
        total = parseInt(countResult[0][0].TOTAL || countResult[0][0].total || 0);
      }
      
      console.log(`📊 [Query Streamer] Estimativa: ${total} registros`);
      
      // Decide estratégia
      if (total > threshold) {
        console.log(`🚀 [Query Streamer] Usando modo BATCH (${total} > ${threshold})`);
        return await this.batchQuery(connection, sqlQuery, otherOptions);
      } else {
        console.log(`⚡ [Query Streamer] Usando modo NORMAL (${total} <= ${threshold})`);
        // Execução normal
        const result = await connection.raw(sqlQuery);
        
        let data = [];
        if (result.rows && Array.isArray(result.rows)) {
          data = result.rows;
        } else if (Array.isArray(result[0])) {
          data = result[0];
        } else if (Array.isArray(result)) {
          data = result;
        }
        
        // Transforma strings numéricas
        data = data.map(row => {
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
        
        return data;
      }
      
    } catch (error) {
      console.warn('⚠️ [Query Streamer] Erro ao estimar registros, usando execução normal:', error.message);
      
      // Fallback: execução normal
      const result = await connection.raw(sqlQuery);
      
      let data = [];
      if (result.rows && Array.isArray(result.rows)) {
        data = result.rows;
      } else if (Array.isArray(result[0])) {
        data = result[0];
      } else if (Array.isArray(result)) {
        data = result;
      }
      
      // Transforma strings numéricas
      data = data.map(row => {
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
      
      return data;
    }
  }
}

module.exports = QueryStreamer;
