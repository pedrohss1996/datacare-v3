/**
 * DataCareAutoDiscovery - Engine de Descoberta Automática
 * Identifica a semântica de qualquer conjunto de dados SQL.
 * Zero hardcoding: o sistema não "sabe" o que é um paciente ou conta médica;
 * ele sabe o que é string, número e data, permitindo que qualquer setor use a ferramenta.
 *
 * @see docs/BI_PROMPT_MESTRE_JSON.md
 * @see cite: 2026-01-19, 2026-01-25
 */
(function(global) {
  'use strict';

  class DataCareAutoDiscovery {
    /**
     * Analisa a primeira amostra de dados e define a estratégia de visualização ideal.
     * @param {Array<Object>} dataSample - Amostra de dados (ex: primeira linha ou chunk)
     * @returns {Object|null} { dimensions, metrics, primaryIntent } ou null se vazio
     */
    static analyze(dataSample) {
      if (!dataSample || dataSample.length === 0) return null;

      const firstRow = dataSample[0];
      const analysis = {
        dimensions: [], // Eixos, Categorias, Datas
        metrics: [],   // Valores, Somas, Médias
        primaryIntent: 'table'
      };

      Object.entries(firstRow).forEach(([key, value]) => {
        const type = typeof value;
        const upperKey = key.toUpperCase();

        // 0. Datas (por nome ou valor)
        if (this.isDate(upperKey, value)) {
          analysis.dimensions.push({ field: key, type: 'date', label: this.toPrettyLabel(key) });
          return;
        }
        // 1. Métricas: números ou strings numéricas (ex: Oracle retorna "123.45")
        const num = type === 'number' ? value : parseFloat(value);
        if (!isNaN(num) && !upperKey.includes('ID')) {
          analysis.metrics.push({
            field: key,
            label: this.toPrettyLabel(key),
            suggestedOp: (upperKey.includes('VALOR') || upperKey.includes('VL_') || upperKey.includes('FATURAMENTO')) ? 'sum' : 'avg'
          });
          return;
        }
        // 2. Dimensões: strings, textos, códigos
        if (type === 'string' || (value != null && type !== 'object')) {
          analysis.dimensions.push({ field: key, type: 'string', label: this.toPrettyLabel(key) });
        }
      });

      analysis.primaryIntent = this.suggestChart(analysis);
      return analysis;
    }

    /**
     * Verifica se a coluna/valor representa data
     */
    static isDate(key, value) {
      return /DATE|DT_|DATA|MÊS|MES|ANO|YEAR|MONTH|DAY/i.test(key) ||
        (value != null && !isNaN(Date.parse(value)) && String(value).length > 8);
    }

    /**
     * Converte nome técnico em label legível
     * Ex: DS_SETOR_ATENDIMENTO -> Setor Atendimento
     */
    static toPrettyLabel(key) {
      return String(key)
        .replace(/^(NM_|DS_|VL_|DT_|NR_|CD_|TP_|ST_|QT_)/i, '')
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, l => l.toUpperCase())
        .trim() || key;
    }

    /**
     * Sugere o tipo de gráfico ideal com base na análise
     */
    static suggestChart(analysis) {
      if (analysis.dimensions.some(d => d.type === 'date')) return 'line';
      if (analysis.dimensions.length > 0 && analysis.metrics.length > 0) return 'bar';
      return 'table';
    }

    /**
     * Converte análise em biConfig completo para DataCareBI.render()
     * Permite visualização instantânea sem IA - nível Power BI
     *
     * @param {Object} analysis - Resultado de analyze()
     * @param {Object} options - { title, subtitle, maxKpis, maxChartDimensions }
     * @returns {Object} biConfig no schema DataCare
     */
    static toBiConfig(analysis, options = {}) {
      if (!analysis) return null;

      const {
        title = 'Dashboard',
        subtitle = 'Visualização automática (Auto-Discovery)',
        maxKpis = 4,
        maxChartDimensions = 10
      } = options;

      const dims = analysis.dimensions || [];
      const mets = analysis.metrics || [];
      const dateDim = dims.find(d => d.type === 'date');
      const strDims = dims.filter(d => d.type === 'string');
      const allCols = [...dims.map(d => d.field), ...mets.map(m => m.field)];

      // Filtros a partir de dimensões (excluindo datas para dateRange separado)
      const filters = strDims.slice(0, 4).map((d, i) => ({
        field: d.field,
        label: d.label,
        id: 'filter-' + String(d.field).toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
        type: 'select'
      }));

      // KPIs das métricas (máx 4)
      const kpis = mets.slice(0, maxKpis).map(m => {
        const upper = (m.field || '').toUpperCase();
        const format = (upper.includes('VALOR') || upper.includes('VL_') || upper.includes('FATURAMENTO')) ? 'brl' :
          (upper.includes('DIAS') || upper.includes('PERMANENCIA')) ? 'days' : 'number';
        return {
          type: 'kpi',
          id: 'kpi-' + m.field,
          label: m.label,
          field: m.field,
          calc: m.suggestedOp || 'sum',
          format,
          intent: 'NEUTRAL'
        };
      });

      // Gráfico baseado em primaryIntent
      let chart = null;
      if (analysis.primaryIntent === 'line' && dateDim && mets.length > 0) {
        chart = {
          type: 'chart',
          id: 'chart1',
          chartType: 'line',
          label: dateDim.field,
          value: mets[0].field,
          title: mets[0].label,
          style: 'area'
        };
      } else if (analysis.primaryIntent === 'bar' && strDims.length > 0 && mets.length > 0) {
        chart = {
          type: 'chart',
          id: 'chart1',
          chartType: 'bar',
          label: strDims[0].field,
          value: mets[0].field,
          title: mets[0].label + ' por ' + strDims[0].label
        };
      }

      const widgets = [...kpis];
      if (chart) widgets.push(chart);
      widgets.push({
        type: 'table',
        columns: allCols,
        limit: 20,
        primaryKey: allCols[0]
      });

      return {
        header: { title, subtitle },
        filters,
        widgets,
        table: { columns: allCols, primaryKey: allCols[0], limit: 20 }
      };
    }

    /**
     * Analisa e converte em biConfig em uma única chamada
     * @param {Array} dataSample - Amostra de dados
     * @param {Object} options - Opções para toBiConfig
     * @returns {Object|null} biConfig ou null
     */
    static analyzeAndToBiConfig(dataSample, options = {}) {
      const analysis = this.analyze(dataSample);
      return analysis ? this.toBiConfig(analysis, options) : null;
    }
  }

  if (typeof global !== 'undefined') {
    global.DataCareAutoDiscovery = DataCareAutoDiscovery;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataCareAutoDiscovery;
  }
})(typeof window !== 'undefined' ? window : globalThis);
