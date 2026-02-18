// ARQUIVO: src/utils/queryOptimizer.js
// Otimizador e analisador de queries SQL para BI

/**
 * OTIMIZADOR DE QUERIES BI PESADAS
 * 
 * Funcionalidades:
 * 1. Analisa queries SQL para detectar problemas de performance
 * 2. Injeta HINTS do Oracle para otimização
 * 3. Adiciona limites automáticos se não existirem
 * 4. Detecta queries perigosas (SELECT *, sem WHERE, etc)
 * 5. Calcula score de complexidade
 * 6. Sugere índices
 */

class QueryOptimizer {
  
  /**
   * Analisa uma query SQL e retorna métricas e sugestões
   */
  static analyze(sqlQuery) {
    const sqlUpper = sqlQuery.toUpperCase();
    const analysis = {
      query: sqlQuery,
      score: 100, // 100 = perfeita, 0 = péssima
      warnings: [],
      suggestions: [],
      risks: [],
      complexity: 'low',
      estimatedRows: 'unknown',
      hasLimit: false,
      hasWhere: false,
      hasIndex: false,
      tables: [],
      joins: 0
    };
    
    // 1. Detecta SELECT *
    if (sqlUpper.includes('SELECT *') || sqlUpper.includes('SELECT*')) {
      analysis.score -= 20;
      analysis.warnings.push('SELECT * detectado - retorna todas as colunas (impacto na memória)');
      analysis.suggestions.push('Especifique apenas as colunas necessárias');
      analysis.risks.push('high_memory');
    }
    
    // 2. Verifica WHERE clause
    if (sqlUpper.includes('WHERE')) {
      analysis.hasWhere = true;
    } else {
      analysis.score -= 30;
      analysis.warnings.push('Query sem filtro WHERE - pode retornar tabela completa');
      analysis.suggestions.push('Adicione filtros WHERE (ex: data, setor, status)');
      analysis.risks.push('full_table_scan');
    }
    
    // 3. Verifica LIMIT/FETCH FIRST
    if (sqlUpper.includes('FETCH FIRST') || sqlUpper.includes('ROWNUM')) {
      analysis.hasLimit = true;
    } else {
      analysis.score -= 25;
      analysis.warnings.push('Query sem limite de registros');
      analysis.suggestions.push('Adicione FETCH FIRST 1000 ROWS ONLY');
      analysis.risks.push('unlimited_rows');
    }
    
    // 4. Detecta JOINs
    const joinMatches = sqlQuery.match(/JOIN/gi);
    analysis.joins = joinMatches ? joinMatches.length : 0;
    
    if (analysis.joins > 3) {
      analysis.score -= 10 * (analysis.joins - 3);
      analysis.warnings.push(`${analysis.joins} JOINs detectados - pode ser lento`);
      analysis.suggestions.push('Considere usar views materializadas ou tabelas agregadas');
      analysis.complexity = 'high';
    } else if (analysis.joins > 1) {
      analysis.complexity = 'medium';
    }
    
    // 5. Detecta tabelas
    const fromMatch = sqlQuery.match(/FROM\s+([a-zA-Z0-9_]+)/i);
    if (fromMatch) {
      analysis.tables.push(fromMatch[1]);
    }
    
    // Detecta tabelas nos JOINs
    const joinTableMatches = sqlQuery.matchAll(/JOIN\s+([a-zA-Z0-9_]+)/gi);
    for (const match of joinTableMatches) {
      analysis.tables.push(match[1]);
    }
    
    // 6. Detecta subqueries
    const subqueryCount = (sqlQuery.match(/\(SELECT/gi) || []).length;
    if (subqueryCount > 0) {
      analysis.score -= 5 * subqueryCount;
      analysis.warnings.push(`${subqueryCount} subquery(s) detectada(s)`);
      analysis.suggestions.push('Considere usar WITH (CTE) para melhor performance');
      analysis.complexity = 'high';
    }
    
    // 7. Detecta GROUP BY sem índice
    if (sqlUpper.includes('GROUP BY')) {
      analysis.warnings.push('GROUP BY detectado - certifique-se de ter índices nas colunas agrupadas');
      analysis.suggestions.push('Adicione índices nas colunas do GROUP BY para performance');
    }
    
    // 8. Detecta ORDER BY
    if (sqlUpper.includes('ORDER BY')) {
      analysis.warnings.push('ORDER BY detectado - pode ser custoso em grandes volumes');
      analysis.suggestions.push('Se possível, ordene no frontend ou limite os registros');
    }
    
    // 9. Detecta agregações complexas
    const aggregations = ['SUM(', 'AVG(', 'COUNT(', 'MAX(', 'MIN('];
    const aggCount = aggregations.reduce((count, agg) => {
      return count + (sqlUpper.split(agg).length - 1);
    }, 0);
    
    if (aggCount > 5) {
      analysis.score -= 5;
      analysis.warnings.push(`${aggCount} funções de agregação detectadas`);
      analysis.complexity = 'high';
    }
    
    // 10. Verifica se tem filtro de data recente
    const recentDatePatterns = [
      /SYSDATE\s*-\s*\d+/i,
      /TRUNC\(SYSDATE\)/i,
      /CURRENT_DATE/i,
      />\s*SYSDATE\s*-/i
    ];
    
    const hasRecentDateFilter = recentDatePatterns.some(pattern => pattern.test(sqlQuery));
    if (!hasRecentDateFilter && analysis.hasWhere) {
      analysis.warnings.push('Não foi detectado filtro de data recente');
      analysis.suggestions.push('Considere adicionar filtro de data (ex: últimos 30 dias)');
    }
    
    // 11. Calcula complexidade final
    if (analysis.score >= 80) {
      analysis.complexity = 'low';
    } else if (analysis.score >= 50) {
      analysis.complexity = 'medium';
    } else {
      analysis.complexity = 'high';
    }
    
    // 12. Estima quantidade de registros
    if (!analysis.hasLimit) {
      analysis.estimatedRows = 'unlimited';
    } else if (sqlUpper.includes('FETCH FIRST')) {
      const match = sqlQuery.match(/FETCH FIRST (\d+)/i);
      if (match) {
        analysis.estimatedRows = parseInt(match[1]);
      }
    }
    
    return analysis;
  }
  
  /**
   * Otimiza uma query SQL automaticamente
   */
  static optimize(sqlQuery, options = {}) {
    const {
      autoLimit = true,
      limitRows = 1000,
      addHints = true,
      forceIndexes = false
    } = options;
    
    let optimizedQuery = sqlQuery.trim().replace(/;$/, '');
    const sqlUpper = optimizedQuery.toUpperCase();
    
    // 1. Adiciona LIMIT se não existir
    if (autoLimit && !sqlUpper.includes('FETCH FIRST') && !sqlUpper.includes('ROWNUM')) {
      console.log(`🔧 [Query Optimizer] Adicionando FETCH FIRST ${limitRows} ROWS ONLY`);
      optimizedQuery = `${optimizedQuery}\nFETCH FIRST ${limitRows} ROWS ONLY`;
    }
    
    // 2. Adiciona HINTS do Oracle para otimização
    if (addHints && sqlUpper.startsWith('SELECT')) {
      // Detecta se já tem hint
      if (!sqlUpper.includes('/*+')) {
        // Adiciona hint FIRST_ROWS para priorizar primeiras linhas
        // Útil para dashboards que precisam renderizar rápido
        const hintPosition = optimizedQuery.indexOf('SELECT') + 6;
        optimizedQuery = 
          optimizedQuery.slice(0, hintPosition) + 
          ' /*+ FIRST_ROWS(' + limitRows + ') */' + 
          optimizedQuery.slice(hintPosition);
        
        console.log(`🔧 [Query Optimizer] Hint FIRST_ROWS adicionado`);
      }
    }
    
    return optimizedQuery;
  }
  
  /**
   * Verifica se uma query é segura para execução
   */
  static isSafe(sqlQuery) {
    const analysis = this.analyze(sqlQuery);
    
    // Query é considerada insegura se:
    // 1. Não tem WHERE nem LIMIT
    // 2. Tem SELECT * sem WHERE e sem LIMIT
    // 3. Score abaixo de 30
    
    if (!analysis.hasWhere && !analysis.hasLimit) {
      return {
        safe: false,
        reason: 'Query sem WHERE e sem LIMIT pode retornar toda a tabela',
        analysis
      };
    }
    
    if (analysis.score < 30) {
      return {
        safe: false,
        reason: 'Query com score de segurança muito baixo',
        analysis
      };
    }
    
    if (analysis.risks.includes('full_table_scan') && !analysis.hasLimit) {
      return {
        safe: false,
        reason: 'Risco de Full Table Scan sem limite de registros',
        analysis
      };
    }
    
    return {
      safe: true,
      analysis
    };
  }
  
  /**
   * Gera sugestões de índices baseado na query
   */
  static suggestIndexes(sqlQuery) {
    const suggestions = [];
    const sqlUpper = sqlQuery.toUpperCase();
    
    // Detecta colunas no WHERE
    const whereMatch = sqlQuery.match(/WHERE\s+(.*?)(?:GROUP BY|ORDER BY|FETCH|$)/is);
    if (whereMatch) {
      const whereClause = whereMatch[1];
      
      // Extrai colunas comparadas
      const columnMatches = whereClause.matchAll(/([a-zA-Z0-9_]+)\s*(?:=|>|<|>=|<=|LIKE|IN)/gi);
      
      const columns = new Set();
      for (const match of columnMatches) {
        columns.add(match[1]);
      }
      
      if (columns.size > 0) {
        suggestions.push({
          type: 'WHERE clause',
          columns: Array.from(columns),
          sql: `CREATE INDEX idx_${Array.from(columns).join('_')} ON <tabela> (${Array.from(columns).join(', ')});`
        });
      }
    }
    
    // Detecta colunas no ORDER BY
    const orderByMatch = sqlQuery.match(/ORDER BY\s+(.*?)(?:FETCH|$)/is);
    if (orderByMatch) {
      const orderByClause = orderByMatch[1];
      const columns = orderByClause.split(',').map(col => col.trim().split(/\s+/)[0]);
      
      suggestions.push({
        type: 'ORDER BY',
        columns,
        sql: `CREATE INDEX idx_order_${columns.join('_')} ON <tabela> (${columns.join(', ')});`
      });
    }
    
    // Detecta colunas no GROUP BY
    const groupByMatch = sqlQuery.match(/GROUP BY\s+(.*?)(?:ORDER BY|HAVING|FETCH|$)/is);
    if (groupByMatch) {
      const groupByClause = groupByMatch[1];
      const columns = groupByClause.split(',').map(col => col.trim());
      
      suggestions.push({
        type: 'GROUP BY',
        columns,
        sql: `CREATE INDEX idx_group_${columns.join('_')} ON <tabela> (${columns.join(', ')});`
      });
    }
    
    return suggestions;
  }
  
  /**
   * Corrige formatos de data para evitar ORA-01843 no Oracle.
   * Detecta comparações com strings de data e sugere TO_DATE/TRUNC.
   */
  static fixDateFormats(sqlQuery) {
    let sql = sqlQuery;
    // Padrões comuns que causam ORA-01843: comparação de coluna DATE com string 'YYYY-MM-DD'
    const datePatterns = [
      { from: /=\s*'(\d{4}-\d{2}-\d{2})'/g, to: "= TO_DATE('$1','YYYY-MM-DD')" },
      { from: />=\s*'(\d{4}-\d{2}-\d{2})'/g, to: ">= TO_DATE('$1','YYYY-MM-DD')" },
      { from: /<=\s*'(\d{4}-\d{2}-\d{2})'/g, to: "<= TO_DATE('$1','YYYY-MM-DD')" },
      { from: />\s*'(\d{4}-\d{2}-\d{2})'/g, to: "> TO_DATE('$1','YYYY-MM-DD')" },
      { from: /<\s*'(\d{4}-\d{2}-\d{2})'/g, to: "< TO_DATE('$1','YYYY-MM-DD')" }
    ];
    datePatterns.forEach(p => {
      sql = sql.replace(p.from, p.to);
    });
    return sql;
  }

  /**
   * Formata query SQL para melhor legibilidade
   */
  static format(sqlQuery) {
    return sqlQuery
      .replace(/\bSELECT\b/gi, '\nSELECT\n  ')
      .replace(/\bFROM\b/gi, '\nFROM\n  ')
      .replace(/\bWHERE\b/gi, '\nWHERE\n  ')
      .replace(/\bAND\b/gi, '\n  AND ')
      .replace(/\bOR\b/gi, '\n  OR ')
      .replace(/\bJOIN\b/gi, '\nJOIN\n  ')
      .replace(/\bGROUP BY\b/gi, '\nGROUP BY\n  ')
      .replace(/\bORDER BY\b/gi, '\nORDER BY\n  ')
      .replace(/\bFETCH FIRST\b/gi, '\nFETCH FIRST')
      .trim();
  }
}

module.exports = QueryOptimizer;
