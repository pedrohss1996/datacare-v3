/**
 * DataCareAutoDiscovery - Engine de Descoberta Automática (Node.js)
 * Versão backend para uso em streaming, API ou fallback sem IA.
 * Identifica a semântica de qualquer conjunto de dados SQL.
 *
 * Zero hardcoding | Velocidade de resposta | Ações Inteligentes via toPrettyLabel
 * @see public/js/DataCareAutoDiscovery.js (versão browser)
 */
class DataCareAutoDiscovery {
  /**
   * Analisa a primeira amostra de dados e define a estratégia de visualização ideal.
   * @param {Array<Object>} dataSample - Amostra de dados
   * @returns {Object|null} { dimensions, metrics, primaryIntent }
   */
  static analyze(dataSample) {
    if (!dataSample || dataSample.length === 0) return null;

    const firstRow = dataSample[0];
    const analysis = {
      dimensions: [],
      metrics: [],
      primaryIntent: 'table'
    };

    for (const [key, value] of Object.entries(firstRow)) {
      const type = typeof value;
      const upperKey = key.toUpperCase();

      if (this.isDate(upperKey, value)) {
        analysis.dimensions.push({ field: key, type: 'date', label: this.toPrettyLabel(key) });
        continue;
      }
      const num = type === 'number' ? value : parseFloat(value);
      if (!isNaN(num) && !upperKey.includes('ID')) {
        analysis.metrics.push({
          field: key,
          label: this.toPrettyLabel(key),
          suggestedOp: (upperKey.includes('VALOR') || upperKey.includes('VL_') || upperKey.includes('FATURAMENTO')) ? 'sum' : 'avg'
        });
        continue;
      }
      if (type === 'string' || (value != null && type !== 'object')) {
        analysis.dimensions.push({ field: key, type: 'string', label: this.toPrettyLabel(key) });
      }
    }

    analysis.primaryIntent = this.suggestChart(analysis);
    return analysis;
  }

  static isDate(key, value) {
    return /DATE|DT_|DATA|MÊS|MES|ANO|YEAR|MONTH|DAY/i.test(key) ||
      (value != null && !isNaN(Date.parse(value)) && String(value).length > 8);
  }

  static toPrettyLabel(key) {
    return String(key)
      .replace(/^(NM_|DS_|VL_|DT_|NR_|CD_|TP_|ST_|QT_)/i, '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, l => l.toUpperCase())
      .trim() || key;
  }

  static suggestChart(analysis) {
    if (analysis.dimensions.some(d => d.type === 'date')) return 'line';
    if (analysis.dimensions.length > 0 && analysis.metrics.length > 0) return 'bar';
    return 'table';
  }

  /**
   * Converte análise em biConfig para DataCareBI
   * @param {Object} analysis
   * @param {Object} options - { title, subtitle, maxKpis }
   */
  static toBiConfig(analysis, options = {}) {
    if (!analysis) return null;

    const { title = 'Dashboard', subtitle = 'Visualização automática (Auto-Discovery)', maxKpis = 4 } = options;
    const dims = analysis.dimensions || [];
    const mets = analysis.metrics || [];
    const dateDim = dims.find(d => d.type === 'date');
    const strDims = dims.filter(d => d.type === 'string');
    const allCols = [...dims.map(d => d.field), ...mets.map(m => m.field)];

    const filters = strDims.slice(0, 4).map(d => ({
      field: d.field,
      label: d.label,
      id: 'filter-' + String(d.field).toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
      type: 'select'
    }));

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

    let chart = null;
    if (analysis.primaryIntent === 'line' && dateDim && mets.length > 0) {
      chart = { type: 'chart', id: 'chart1', chartType: 'line', label: dateDim.field, value: mets[0].field, title: mets[0].label, style: 'area' };
    } else if (analysis.primaryIntent === 'bar' && strDims.length > 0 && mets.length > 0) {
      chart = { type: 'chart', id: 'chart1', chartType: 'bar', label: strDims[0].field, value: mets[0].field, title: mets[0].label + ' por ' + strDims[0].label };
    }

    const widgets = [...kpis];
    if (chart) widgets.push(chart);
    widgets.push({ type: 'table', columns: allCols, limit: 20, primaryKey: allCols[0] });

    return { header: { title, subtitle }, filters, widgets, table: { columns: allCols, primaryKey: allCols[0], limit: 20 } };
  }

  /**
   * Atalho: analisa e retorna biConfig
   */
  static analyzeAndToBiConfig(dataSample, options = {}) {
    const analysis = this.analyze(dataSample);
    return analysis ? this.toBiConfig(analysis, options) : null;
  }
}

module.exports = DataCareAutoDiscovery;
