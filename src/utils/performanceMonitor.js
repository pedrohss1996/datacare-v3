// ARQUIVO: src/utils/performanceMonitor.js
// Monitor de performance para consultas BI pesadas

/**
 * MONITOR DE PERFORMANCE BI
 * 
 * Funcionalidades:
 * - Rastreamento de tempo de execução de queries
 * - Detecção de queries lentas
 * - Estatísticas em tempo real
 * - Alertas de performance
 * - Histórico de execuções
 */

class PerformanceMonitor {
  constructor() {
    this.queries = new Map(); // Queries em execução
    this.history = []; // Histórico das últimas 100 queries
    this.maxHistorySize = 100;
    this.slowQueryThreshold = 5000; // 5 segundos
  }
  
  /**
   * Inicia monitoramento de uma query
   */
  startQuery(queryId, sqlQuery, metadata = {}) {
    const startTime = Date.now();
    
    this.queries.set(queryId, {
      id: queryId,
      sql: sqlQuery,
      startTime,
      metadata,
      status: 'running'
    });
    
    console.log(`⏱️ [Performance Monitor] Query ${queryId} iniciada`);
    
    return queryId;
  }
  
  /**
   * Finaliza monitoramento de uma query
   */
  endQuery(queryId, result = {}) {
    const query = this.queries.get(queryId);
    
    if (!query) {
      console.warn(`⚠️ [Performance Monitor] Query ${queryId} não encontrada`);
      return null;
    }
    
    const endTime = Date.now();
    const duration = endTime - query.startTime;
    
    const completedQuery = {
      ...query,
      endTime,
      duration,
      status: 'completed',
      result: {
        rowCount: result.rowCount || 0,
        dataSize: result.dataSize || 0,
        cached: result.cached || false
      }
    };
    
    // Remove do mapa de queries ativas
    this.queries.delete(queryId);
    
    // Adiciona ao histórico
    this.addToHistory(completedQuery);
    
    // Log colorido baseado na performance
    if (duration > this.slowQueryThreshold) {
      console.log(`🐢 [Performance Monitor] Query LENTA ${queryId}: ${duration}ms (${result.rowCount} registros)`);
    } else if (duration > 2000) {
      console.log(`⚠️ [Performance Monitor] Query ${queryId}: ${duration}ms (${result.rowCount} registros)`);
    } else {
      console.log(`✅ [Performance Monitor] Query ${queryId}: ${duration}ms (${result.rowCount} registros)`);
    }
    
    return completedQuery;
  }
  
  /**
   * Marca query como com erro
   */
  errorQuery(queryId, error) {
    const query = this.queries.get(queryId);
    
    if (!query) {
      return null;
    }
    
    const endTime = Date.now();
    const duration = endTime - query.startTime;
    
    const erroredQuery = {
      ...query,
      endTime,
      duration,
      status: 'error',
      error: error.message
    };
    
    this.queries.delete(queryId);
    this.addToHistory(erroredQuery);
    
    console.log(`❌ [Performance Monitor] Query ${queryId} falhou após ${duration}ms: ${error.message}`);
    
    return erroredQuery;
  }
  
  /**
   * Adiciona query ao histórico
   */
  addToHistory(query) {
    this.history.unshift(query);
    
    // Mantém apenas as últimas N queries
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize);
    }
  }
  
  /**
   * Retorna queries atualmente em execução
   */
  getRunningQueries() {
    const now = Date.now();
    
    return Array.from(this.queries.values()).map(query => ({
      ...query,
      runningFor: now - query.startTime
    }));
  }
  
  /**
   * Retorna estatísticas gerais
   */
  getStats() {
    const completed = this.history.filter(q => q.status === 'completed');
    const errors = this.history.filter(q => q.status === 'error');
    
    if (completed.length === 0) {
      return {
        total: this.history.length,
        completed: 0,
        errors: errors.length,
        avgDuration: 0,
        slowQueries: 0,
        totalRows: 0,
        runningQueries: this.queries.size
      };
    }
    
    const totalDuration = completed.reduce((sum, q) => sum + q.duration, 0);
    const avgDuration = totalDuration / completed.length;
    
    const slowQueries = completed.filter(q => q.duration > this.slowQueryThreshold);
    
    const totalRows = completed.reduce((sum, q) => sum + (q.result?.rowCount || 0), 0);
    
    return {
      total: this.history.length,
      completed: completed.length,
      errors: errors.length,
      avgDuration: Math.round(avgDuration),
      minDuration: Math.min(...completed.map(q => q.duration)),
      maxDuration: Math.max(...completed.map(q => q.duration)),
      slowQueries: slowQueries.length,
      totalRows,
      avgRows: Math.round(totalRows / completed.length),
      runningQueries: this.queries.size
    };
  }
  
  /**
   * Retorna queries lentas
   */
  getSlowQueries(limit = 10) {
    return this.history
      .filter(q => q.status === 'completed' && q.duration > this.slowQueryThreshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }
  
  /**
   * Retorna queries com erro
   */
  getErrorQueries(limit = 10) {
    return this.history
      .filter(q => q.status === 'error')
      .slice(0, limit);
  }
  
  /**
   * Limpa histórico
   */
  clearHistory() {
    this.history = [];
    console.log('🗑️ [Performance Monitor] Histórico limpo');
  }
  
  /**
   * Retorna relatório detalhado
   */
  getReport() {
    const stats = this.getStats();
    const slowQueries = this.getSlowQueries(5);
    const errorQueries = this.getErrorQueries(5);
    const runningQueries = this.getRunningQueries();
    
    return {
      timestamp: new Date().toISOString(),
      stats,
      slowQueries: slowQueries.map(q => ({
        id: q.id,
        duration: q.duration,
        rowCount: q.result?.rowCount || 0,
        sql: q.sql.substring(0, 100) + '...'
      })),
      errorQueries: errorQueries.map(q => ({
        id: q.id,
        duration: q.duration,
        error: q.error,
        sql: q.sql.substring(0, 100) + '...'
      })),
      runningQueries: runningQueries.map(q => ({
        id: q.id,
        runningFor: q.runningFor,
        sql: q.sql.substring(0, 100) + '...'
      }))
    };
  }
  
  /**
   * Imprime relatório no console
   */
  printReport() {
    const report = this.getReport();
    
    console.log('\n========================================');
    console.log('📊 RELATÓRIO DE PERFORMANCE BI');
    console.log('========================================');
    console.log(`📅 Data: ${report.timestamp}`);
    console.log('\n📈 ESTATÍSTICAS:');
    console.log(`   Total de Queries: ${report.stats.total}`);
    console.log(`   Completadas: ${report.stats.completed}`);
    console.log(`   Com Erro: ${report.stats.errors}`);
    console.log(`   Em Execução: ${report.stats.runningQueries}`);
    console.log(`   Duração Média: ${report.stats.avgDuration}ms`);
    console.log(`   Duração Mín/Máx: ${report.stats.minDuration}ms / ${report.stats.maxDuration}ms`);
    console.log(`   Queries Lentas: ${report.stats.slowQueries}`);
    console.log(`   Total de Registros: ${report.stats.totalRows.toLocaleString('pt-BR')}`);
    console.log(`   Média de Registros: ${report.stats.avgRows.toLocaleString('pt-BR')}`);
    
    if (report.runningQueries.length > 0) {
      console.log('\n⏳ QUERIES EM EXECUÇÃO:');
      report.runningQueries.forEach(q => {
        console.log(`   - ${q.id}: ${q.runningFor}ms - ${q.sql}`);
      });
    }
    
    if (report.slowQueries.length > 0) {
      console.log('\n🐢 TOP 5 QUERIES LENTAS:');
      report.slowQueries.forEach((q, i) => {
        console.log(`   ${i + 1}. ${q.duration}ms (${q.rowCount} rows) - ${q.sql}`);
      });
    }
    
    if (report.errorQueries.length > 0) {
      console.log('\n❌ ÚLTIMOS ERROS:');
      report.errorQueries.forEach((q, i) => {
        console.log(`   ${i + 1}. ${q.error} - ${q.sql}`);
      });
    }
    
    console.log('========================================\n');
  }
}

// Instância singleton
const monitor = new PerformanceMonitor();

// Imprime relatório a cada 5 minutos (em produção)
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    monitor.printReport();
  }, 5 * 60 * 1000);
}

module.exports = monitor;
