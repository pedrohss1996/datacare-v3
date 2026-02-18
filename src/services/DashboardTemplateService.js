/**
 * DashboardTemplateService - Merge do JSON biConfig no template HTML fixo
 * Gemini retorna apenas JSON; o backend faz o merge em template otimizado
 */

function mergeBiConfig(biConfig, queryCode, formCode) {
  const widgets = biConfig.widgets || [];
  let filters = (biConfig.filters || []).map((f, i) => ({
    field: f.field,
    label: f.label || f.field,
    id: 'filter-' + String(f.field || 'f' + i).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '')
  }));

  if (filters.length === 0) {
    const tables = widgets.filter(w => w.type === 'table');
    const rawCols = (tables[0]?.columns || []).map(c => (typeof c === 'string' ? c : (c.field || c.label || c)));
    const categoricalPattern = /^(DS_|NM_|NO_|CD_|TP_|ST_|STATUS|SETOR|TIPO|RESPONSAVEL|UNIDADE|DEPARTAMENTO)/i;
    filters = rawCols
      .filter(col => col && categoricalPattern.test(col) && !/DT_|DATA|DATE/i.test(col))
      .slice(0, 5)
      .map((col, i) => ({
        field: col,
        label: col.replace(/_/g, ' '),
        id: 'filter-' + String(col).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '')
      }));
  }

  const filterById = {};
  filters.forEach(f => { filterById[f.field] = f.id; });

  const kpis = widgets.filter(w => w.type === 'kpi').slice(0, 4).map(w => ({
    label: w.label,
    calc: w.calc || w.op || 'count',
    field: w.field,
    format: w.format || 'number',
    intent: (w.intent || 'NEUTRAL').toUpperCase(),
    action: w.action || null
  }));

  const charts = widgets.filter(w => w.type === 'chart').slice(0, 2).map((w, i) => ({
    id: w.id || 'chart' + (i + 1),
    chartType: w.chartType || 'bar',
    label: w.label,
    value: w.value || w.label,
    title: w.title || w.label,
    filterId: w.filterId || (w.label && filterById[w.label] ? filterById[w.label] : null)
  }));

  const tables = widgets.filter(w => w.type === 'table');
  const tbl = tables[0] || {};
  const rawCols = tbl.columns || [];
  const cols = rawCols.map(c => (typeof c === 'string' ? c : (c.field || c.label || c)));

  const modalFieldsSource = biConfig.modalFields || cols.map(c => ({ field: c, label: c }));
  const modalFields = modalFieldsSource.map(f =>
    typeof f === 'string' ? { field: f, label: f } : { field: f.field || f.label || f, label: f.label || f.field || f }
  );

  return {
    queryCode: queryCode || biConfig.queryCode || 'QUERY_ID',
    formCode: formCode || biConfig.formCode || 'FORM_ACTION',
    header: biConfig.header || { title: 'Dashboard', subtitle: '' },
    filters,
    kpis,
    charts,
    table: {
      columns: cols,
      primaryKey: tbl.primaryKey || cols[0] || 'ID',
      pageSize: tbl.limit || 10
    },
    modalFields
  };
}

function render(biConfig, queryCode, formCode, res) {
  const config = mergeBiConfig(biConfig, queryCode, formCode);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.render('pages/analytics/dashboard-page', { config, layout: false });
}

module.exports = { mergeBiConfig, render };
