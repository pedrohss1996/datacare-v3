/**
 * AI Engine - Assistente de dashboards via Gemini.
 * Retorna configuração JSON (config) para renderização nativa no frontend.
 * Não gera mais HTML completo — o DashboardRenderer no frontend cuida da renderização.
 */
const axios = require('axios');
const datasetService = require('../datasets/dataset.service');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function buildSchemaText(columns) {
  return columns.map((c) => `${c.name} (${c.type})`).join(', ');
}

/**
 * Detecta tipos de colunas a partir do schema (sem precisar dos dados).
 */
function detectColumnTypes(colDefs) {
  const numCols = [], catCols = [], dateCols = [];
  colDefs.forEach((col) => {
    const t = (col.type || '').toLowerCase();
    if (t.includes('date') || t.includes('timestamp') || t.includes('time')) {
      dateCols.push(col.name);
    } else if (
      t.includes('int') || t.includes('float') || t.includes('double') ||
      t.includes('decimal') || t.includes('numeric') || t.includes('number') ||
      t.includes('real') || t.includes('money')
    ) {
      numCols.push(col.name);
    } else {
      catCols.push(col.name);
    }
  });
  return { numCols, catCols, dateCols };
}

/**
 * Gera configuração JSON do dashboard (sem HTML).
 * O DashboardRenderer no frontend usa este objeto para renderizar nativamente.
 */
function buildDefaultDashboardConfig(columns) {
  const colDefs = columns.filter((c) => c.name !== '_row_id');
  const { numCols, catCols, dateCols } = detectColumnTypes(colDefs);
  const n0 = numCols[0], n1 = numCols[1], c0 = catCols[0], c1 = catCols[1];

  const kpis = [{ type: 'total', label: 'Total de Registros', sub: 'registros na base' }];
  if (n0) kpis.push({ type: 'sum', col: n0, label: 'Total ' + n0, sub: 'soma acumulada' });
  const ncAvg = n1 || n0;
  if (ncAvg) kpis.push({ type: 'avg', col: ncAvg, label: 'Média ' + ncAvg, sub: 'média aritmética' });
  if (c0) kpis.push({ type: 'unique', col: c0, label: c0 + ' únicos', sub: 'categorias distintas' });
  if (n0) kpis.push({ type: 'max', col: n0, label: 'Máximo ' + n0, sub: 'maior valor' });
  if (n0 && kpis.length < 6) kpis.push({ type: 'min', col: n0, label: 'Mínimo ' + n0, sub: 'menor valor' });

  const charts = [];
  if (c0) charts.push({ id: 'ch1', title: 'Top 10 — ' + c0, type: 'bar', catCol: c0, numCol: n0 || null, icon: '📊' });
  if (c0) charts.push({ id: 'ch2', title: 'Distribuição — ' + c0, type: 'doughnut', catCol: c0, numCol: n0 || null, icon: '🍩' });
  if (c1) {
    charts.push({ id: 'ch3', title: 'Ranking — ' + c1, type: 'horizontalBar', catCol: c1, numCol: n0 || null, icon: '📉' });
  } else if (n1) {
    charts.push({ id: 'ch3', title: n0 + ' vs ' + n1, type: 'scatter', numCol: n0, numCol2: n1, icon: '⚡' });
  } else if (c0) {
    charts.push({ id: 'ch3', title: 'Ranking — ' + c0, type: 'horizontalBar', catCol: c0, numCol: n0 || null, icon: '📉' });
  }
  const cp = c1 || c0;
  if (cp && n0) charts.push({ id: 'ch4', title: 'Área Polar — ' + cp, type: 'polarArea', catCol: cp, numCol: n0, icon: '🎯' });

  const filters = [];
  catCols.slice(0, 3).forEach((col) => filters.push({ col, type: 'select' }));
  if (dateCols.length) filters.push({ col: dateCols[0], type: 'daterange' });

  return {
    version: 2,
    title: 'Dashboard Analítico',
    columns: colDefs,
    detectedTypes: { numCols, catCols, dateCols },
    kpis: kpis.slice(0, 6),
    charts: charts.slice(0, 4),
    filters,
  };
}

/**
 * Gera HTML padrão completo do dashboard BI com Chart.js.
 * KPIs clicáveis abrem modal detalhado com estatísticas, gráfico e tabela.
 * Inclui: 4-6 KPIs interativos, filtros, 4 gráficos, tabela paginada/ordenável/pesquisável.
 * O HTML retornado é um fragmento (sem <html>/<head>/<body>) para ser injetado no iframe.
 */
function buildDefaultDashboardHtml(columns) {
  const colDefs = columns.filter((c) => c.name !== '_row_id');
  const safeColDefs = JSON.stringify(colDefs);

  return `<style>
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideUp{from{opacity:0;transform:translateY(36px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes overlayIn{from{opacity:0}to{opacity:1}}
</style>
<div id="dash-loading" style="position:fixed;inset:0;background:#f1f5f9;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;z-index:99;">
  <div style="width:48px;height:48px;border:4px solid #e2e8f0;border-top-color:#3b82f6;border-radius:50%;animation:spin 1s linear infinite;"></div>
  <p style="color:#64748b;font-size:14px;font-family:Inter,sans-serif;font-weight:500;">Carregando dashboard...</p>
</div>
<div id="dash-app" style="display:none;padding:20px 24px;max-width:1600px;margin:0 auto;">
  <div style="margin-bottom:24px;">
    <h1 id="dash-title" style="font-size:22px;font-weight:700;color:#0f172a;font-family:Inter,sans-serif;">Dashboard Analítico</h1>
    <p id="dash-desc" style="color:#64748b;font-size:13px;margin-top:4px;font-family:Inter,sans-serif;"></p>
  </div>
  <div id="kpi-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px;"></div>
  <div id="filter-card" style="display:none;background:white;border-radius:12px;padding:16px 20px;box-shadow:0 1px 3px rgba(0,0,0,.08);border:1px solid #e2e8f0;margin-bottom:24px;">
    <div style="font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px;">🔍 Filtros</div>
    <div id="filter-row" style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;"></div>
  </div>
  <div id="charts-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;"></div>
  <div style="background:white;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08);border:1px solid #e2e8f0;animation:fadeIn .6s ease .3s both;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
      <div style="font-size:14px;font-weight:600;color:#374151;font-family:Inter,sans-serif;">📋 Dados Completos</div>
      <input id="search-inp" type="text" placeholder="🔍 Pesquisar..." style="padding:7px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;width:220px;outline:none;font-family:Inter,sans-serif;color:#1e293b;">
    </div>
    <div style="overflow-x:auto;">
      <table id="main-table" style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead id="tbl-head"></thead>
        <tbody id="tbl-body"></tbody>
      </table>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;flex-wrap:wrap;gap:12px;">
      <div id="page-info" style="font-size:13px;color:#64748b;font-family:Inter,sans-serif;"></div>
      <div id="page-btns" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
    </div>
  </div>

  <!-- KPI Detail Modal -->
  <div id="modal-overlay" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.65);backdrop-filter:blur(4px);z-index:500;align-items:center;justify-content:center;padding:16px;animation:overlayIn .2s ease;">
    <div id="modal-box" style="background:white;border-radius:20px;width:100%;max-width:980px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 32px 72px rgba(0,0,0,.35);animation:slideUp .3s cubic-bezier(.16,1,.3,1);">
      <div id="modal-header" style="padding:20px 24px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:14px;flex-shrink:0;">
        <div id="modal-icon-wrap" style="width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;">
          <div id="modal-kpi-label" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#64748b;font-family:Inter,sans-serif;margin-bottom:4px;"></div>
          <div id="modal-kpi-value" style="font-size:32px;font-weight:700;color:#0f172a;font-family:Inter,sans-serif;line-height:1;"></div>
        </div>
        <div id="modal-kpi-sub" style="font-size:12px;color:#94a3b8;font-family:Inter,sans-serif;text-align:right;max-width:140px;"></div>
        <button id="modal-close-btn" style="width:36px;height:36px;border-radius:10px;border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer;font-size:18px;color:#64748b;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:sans-serif;margin-left:8px;">✕</button>
      </div>
      <div id="modal-stats" style="padding:14px 24px;border-bottom:1px solid #f1f5f9;display:flex;gap:10px;flex-wrap:wrap;flex-shrink:0;background:#fafafa;"></div>
      <div id="modal-body" style="flex:1;overflow-y:auto;padding:20px 24px;display:grid;grid-template-columns:1fr 1fr;gap:20px;min-height:0;">
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#374151;margin-bottom:12px;font-family:Inter,sans-serif;">📊 Análise Visual</div>
          <div style="background:#f8fafc;border-radius:12px;padding:16px;height:290px;position:relative;"><canvas id="modal-chart"></canvas></div>
        </div>
        <div style="display:flex;flex-direction:column;">
          <div id="modal-tbl-title" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#374151;margin-bottom:12px;font-family:Inter,sans-serif;"></div>
          <div style="overflow:auto;flex:1;border-radius:10px;border:1px solid #e2e8f0;max-height:340px;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead id="modal-thead"></thead>
              <tbody id="modal-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<script>
(function() {
  var DATA = window.DASHBOARD_DATA || [];
  var COLS = ${safeColDefs};
  var filtered = DATA.slice();
  var PAGE = 1, PAGE_SIZE = 15, sortCol = null, sortDir = 1;
  var charts = {}, activeFilters = {};
  var modalChart = null;
  var KPIS = [];
  var COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#14b8a6','#a855f7'];
  var KPI_COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ef4444','#06b6d4'];
  var KPI_BGS   = ['#eff6ff','#f0fdf4','#faf5ff','#fffbeb','#fff1f2','#ecfeff'];
  var KPI_ICONS = ['📊','📈','📉','🏷️','🔺','🔹'];

  function fmt(n) {
    if (n == null) return '-';
    if (typeof n === 'number') {
      if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
      return n % 1 ? n.toFixed(2) : n.toLocaleString('pt-BR');
    }
    return String(n);
  }

  function fmtFull(n) {
    if (n == null) return '—';
    if (typeof n === 'number') return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    return String(n);
  }

  function pct(a, b) { return b ? ((a / b) * 100).toFixed(1) + '%' : '0%'; }

  function detectTypes() {
    var numCols = [], catCols = [], dateCols = [];
    var sample = DATA.slice(0, 100);
    COLS.forEach(function(col) {
      var t = (col.type || '').toLowerCase();
      var vals = sample.map(function(r) { return r[col.name]; }).filter(function(v) { return v != null && v !== ''; });
      if (!vals.length) { catCols.push(col.name); return; }
      var isDate = t.includes('date') || t.includes('time') || (typeof vals[0] === 'string' && /^\d{4}[-/]\d{2}/.test(vals[0]));
      var isNum = t.includes('int') || t.includes('float') || t.includes('double') || t.includes('decimal') || t.includes('numeric') || t.includes('number');
      if (!isNum && !isDate) {
        var nc = vals.filter(function(v) { return !isNaN(parseFloat(v)) && isFinite(v); }).length;
        if (nc / vals.length > 0.8) isNum = true;
      }
      if (isDate) dateCols.push(col.name);
      else if (isNum) numCols.push(col.name);
      else catCols.push(col.name);
    });
    return { numCols: numCols, catCols: catCols, dateCols: dateCols };
  }

  var T = detectTypes();

  function agg(data, col) {
    var m = {};
    data.forEach(function(r) { var k = r[col] != null ? String(r[col]) : '(vazio)'; m[k] = (m[k] || 0) + 1; });
    return m;
  }
  function aggNum(data, catCol, numCol) {
    var m = {};
    data.forEach(function(r) {
      var k = r[catCol] != null ? String(r[catCol]) : '(vazio)';
      m[k] = (m[k] || 0) + (parseFloat(r[numCol]) || 0);
    });
    return m;
  }
  function topN(map, n) {
    return Object.keys(map).sort(function(a, b) { return map[b] - map[a]; }).slice(0, n);
  }
  function numStats(vals) {
    if (!vals.length) return { sum: 0, avg: 0, min: 0, max: 0, p25: 0, p75: 0, p90: 0 };
    var sorted = vals.slice().sort(function(a, b) { return a - b; });
    var sum = sorted.reduce(function(s, v) { return s + v; }, 0);
    return {
      sum: sum, avg: sum / sorted.length,
      min: sorted[0], max: sorted[sorted.length - 1],
      p25: sorted[Math.floor(sorted.length * 0.25)],
      p75: sorted[Math.floor(sorted.length * 0.75)],
      p90: sorted[Math.floor(sorted.length * 0.90)],
      count: sorted.length
    };
  }
  function buildHistoCfg(col, data, font) {
    var vals = data.map(function(r) { return parseFloat(r[col]); }).filter(function(v) { return !isNaN(v); });
    if (!vals.length) return null;
    vals.sort(function(a, b) { return a - b; });
    var mn = vals[0], mx = vals[vals.length - 1], step = (mx - mn) / 10 || 1;
    var counts = new Array(10).fill(0), labels = [];
    for (var i = 0; i < 10; i++) {
      labels.push(fmt(mn + i * step));
      vals.forEach(function(v) { if (v >= mn + i * step && v < mn + (i + 1) * step) counts[i]++; });
    }
    return { type: 'bar', data: { labels: labels, datasets: [{ data: counts, backgroundColor: '#6366f1aa', borderColor: '#6366f1', borderWidth: 1, borderRadius: 4, borderSkipped: false }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return ' ' + c.parsed.y + ' registros'; } } } }, scales: { x: { grid: { display: false }, ticks: { font: font, maxRotation: 30 }, title: { display: true, text: 'Faixas de ' + col, font: font } }, y: { grid: { color: '#f1f5f9' }, ticks: { font: font }, title: { display: true, text: 'Frequência', font: font } } } } };
  }

  /* ── KPI Definitions ── */
  function computeKpiDefs() {
    var defs = [];
    var n0 = T.numCols[0], n1 = T.numCols[1], c0 = T.catCols[0];

    defs.push({ type: 'total', label: 'Total de Registros', sub: 'registros na base',
      getValue: function() { return fmt(filtered.length); } });

    if (n0) {
      defs.push({ type: 'sum', col: n0, label: 'Total ' + n0, sub: 'soma acumulada',
        getValue: function() { return fmt(filtered.reduce(function(s,r){return s+(parseFloat(r[n0])||0);},0)); } });
    }
    var ncAvg = n1 || n0;
    if (ncAvg) {
      defs.push({ type: 'avg', col: ncAvg, label: 'Média ' + ncAvg, sub: 'média aritmética',
        getValue: function() { var s=filtered.reduce(function(a,r){return a+(parseFloat(r[ncAvg])||0);},0); return fmt(s/(filtered.length||1)); } });
    }
    if (c0) {
      defs.push({ type: 'unique', col: c0, label: c0 + ' únicos', sub: 'categorias distintas',
        getValue: function() { return String(new Set(filtered.map(function(r){return r[c0];})).size); } });
    }
    if (n0) {
      defs.push({ type: 'max', col: n0, label: 'Máximo ' + n0, sub: 'maior valor',
        getValue: function() { var vs=filtered.map(function(r){return parseFloat(r[n0]);}).filter(function(v){return !isNaN(v);}); return vs.length?fmt(Math.max.apply(null,vs)):'-'; } });
    }
    if (n0 && defs.length < 6) {
      defs.push({ type: 'min', col: n0, label: 'Mínimo ' + n0, sub: 'menor valor',
        getValue: function() { var vs=filtered.map(function(r){return parseFloat(r[n0]);}).filter(function(v){return !isNaN(v);}); return vs.length?fmt(Math.min.apply(null,vs)):'-'; } });
    }
    return defs.slice(0, 6).map(function(d, i) {
      d.color = KPI_COLORS[i]; d.bg = KPI_BGS[i]; d.icon = KPI_ICONS[i]; d.idx = i;
      return d;
    });
  }

  function buildKPIs() {
    KPIS = computeKpiDefs();
    var grid = document.getElementById('kpi-grid');
    KPIS.forEach(function(k, i) {
      var card = document.createElement('div');
      card.id = 'kpi-card-' + i;
      card.style.cssText = 'background:white;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08);border:1px solid #e2e8f0;border-top:4px solid ' + k.color + ';animation:fadeIn .4s ease ' + (i * 0.07) + 's both;font-family:Inter,sans-serif;cursor:pointer;transition:transform .15s,box-shadow .15s;position:relative;';
      card.innerHTML = '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:8px;">' + k.icon + ' ' + k.label + '</div>'
        + '<div id="kpi-val-' + i + '" style="font-size:30px;font-weight:700;color:#0f172a;line-height:1;">' + k.getValue() + '</div>'
        + '<div style="font-size:12px;color:#94a3b8;margin-top:6px;">' + k.sub + '</div>'
        + '<div style="font-size:11px;font-weight:600;color:' + k.color + ';margin-top:10px;display:flex;align-items:center;gap:4px;">Ver detalhes <span style="font-size:14px;">→</span></div>';
      card.addEventListener('mouseenter', function() { card.style.transform = 'translateY(-3px)'; card.style.boxShadow = '0 6px 20px rgba(0,0,0,.12)'; });
      card.addEventListener('mouseleave', function() { card.style.transform = ''; card.style.boxShadow = '0 1px 3px rgba(0,0,0,.08)'; });
      (function(def) {
        card.addEventListener('click', function() { openKpiModal(def); });
      })(k);
      grid.appendChild(card);
    });
  }

  function updateKpiValues() {
    KPIS.forEach(function(k, i) {
      var el = document.getElementById('kpi-val-' + i);
      if (el) el.textContent = k.getValue();
    });
  }

  /* ── Modal ── */
  function openKpiModal(def) {
    var overlay = document.getElementById('modal-overlay');
    overlay.style.display = 'flex';
    var box = document.getElementById('modal-box');
    box.style.animation = 'none';
    setTimeout(function() { box.style.animation = 'slideUp .3s cubic-bezier(.16,1,.3,1)'; }, 10);

    var iconWrap = document.getElementById('modal-icon-wrap');
    iconWrap.style.background = def.bg;
    iconWrap.textContent = def.icon;
    document.getElementById('modal-kpi-label').textContent = def.label;
    document.getElementById('modal-kpi-value').textContent = def.getValue();
    document.getElementById('modal-kpi-value').style.color = def.color;
    document.getElementById('modal-kpi-sub').textContent = def.sub;

    renderModalStats(def);
    renderModalChart(def);
    renderModalTable(def);
  }

  function closeKpiModal() {
    document.getElementById('modal-overlay').style.display = 'none';
    if (modalChart) { modalChart.destroy(); modalChart = null; }
  }

  document.getElementById('modal-close-btn').addEventListener('click', closeKpiModal);
  document.getElementById('modal-overlay').addEventListener('click', function(e) { if (e.target === this) closeKpiModal(); });
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeKpiModal(); });

  function pill(label, value, color) {
    var el = document.createElement('div');
    el.style.cssText = 'background:white;border:1px solid #e2e8f0;border-radius:10px;padding:8px 14px;font-family:Inter,sans-serif;min-width:80px;';
    el.innerHTML = '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin-bottom:3px;">' + label + '</div>'
      + '<div style="font-size:15px;font-weight:700;color:' + (color || '#1e293b') + ';">' + value + '</div>';
    return el;
  }

  function renderModalStats(def) {
    var stats = document.getElementById('modal-stats');
    stats.innerHTML = '';
    var add = function(l, v, c) { stats.appendChild(pill(l, v, c)); };

    if (def.type === 'total') {
      add('Total', DATA.length.toLocaleString('pt-BR'), '#3b82f6');
      add('Filtrado', filtered.length.toLocaleString('pt-BR'), '#10b981');
      add('% Filtrado', pct(filtered.length, DATA.length));
      add('Colunas', COLS.length);
      if (T.catCols.length) add('Categorias', T.catCols.length);
      if (T.numCols.length) add('Numéricas', T.numCols.length);
    } else if (def.col && (def.type === 'sum' || def.type === 'avg' || def.type === 'max' || def.type === 'min')) {
      var vals = filtered.map(function(r) { return parseFloat(r[def.col]); }).filter(function(v) { return !isNaN(v); });
      var s = numStats(vals);
      add('Soma', fmt(s.sum), '#10b981');
      add('Média', fmt(s.avg), '#3b82f6');
      add('Mínimo', fmt(s.min), '#06b6d4');
      add('Máximo', fmt(s.max), '#ef4444');
      add('P25', fmt(s.p25));
      add('P75', fmt(s.p75));
      add('P90', fmt(s.p90), '#f59e0b');
      add('Registros', (s.count || 0).toLocaleString('pt-BR'));
    } else if (def.type === 'unique' && def.col) {
      var allV = filtered.map(function(r) { return r[def.col]; });
      var withV = allV.filter(function(v) { return v != null && v !== ''; });
      var uniq = new Set(withV).size;
      add('Únicos', uniq.toLocaleString('pt-BR'), '#8b5cf6');
      add('Total', filtered.length.toLocaleString('pt-BR'));
      add('Preenchidos', withV.length.toLocaleString('pt-BR'), '#10b981');
      add('% Preench.', pct(withV.length, filtered.length), '#10b981');
      add('Vazios', (filtered.length - withV.length).toLocaleString('pt-BR'), '#ef4444');
    }
  }

  function renderModalChart(def) {
    if (modalChart) { modalChart.destroy(); modalChart = null; }
    var canvas = document.getElementById('modal-chart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var font = { size: 11, family: 'Inter,-apple-system,sans-serif' };
    var gc = '#f1f5f9';
    var cfg = null;

    if (def.type === 'total') {
      if (T.catCols.length > 0) {
        var m = agg(filtered, T.catCols[0]);
        var ks = topN(m, 15), vs = ks.map(function(k) { return m[k]; });
        cfg = { type: 'bar', data: { labels: ks, datasets: [{ data: vs, backgroundColor: COLORS, borderRadius: 5, borderSkipped: false }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return ' ' + c.parsed.y.toLocaleString('pt-BR'); } } } }, scales: { x: { grid: { display: false }, ticks: { font: font, maxRotation: 35 } }, y: { grid: { color: gc }, ticks: { font: font, callback: function(v) { return fmt(v); } } } } } };
      }
    } else if (def.type === 'sum' || def.type === 'max') {
      if (T.catCols.length > 0) {
        var m2 = aggNum(filtered, T.catCols[0], def.col);
        var ks2 = topN(m2, 10), vs2 = ks2.map(function(k) { return m2[k]; });
        cfg = { type: 'bar', data: { labels: ks2, datasets: [{ data: vs2, backgroundColor: COLORS, borderRadius: 5, borderSkipped: false }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return ' ' + fmtFull(c.parsed.x); } } } }, scales: { x: { grid: { color: gc }, ticks: { font: font, callback: function(v) { return fmt(v); } } }, y: { grid: { display: false }, ticks: { font: font } } } } };
      } else cfg = buildHistoCfg(def.col, filtered, font);
    } else if (def.type === 'avg') {
      cfg = buildHistoCfg(def.col, filtered, font);
    } else if (def.type === 'min') {
      if (T.catCols.length > 0) {
        var m3 = aggNum(filtered, T.catCols[0], def.col);
        var ks3 = Object.keys(m3).sort(function(a, b) { return m3[a] - m3[b]; }).slice(0, 10);
        var vs3 = ks3.map(function(k) { return m3[k]; });
        cfg = { type: 'bar', data: { labels: ks3, datasets: [{ data: vs3, backgroundColor: '#06b6d4', borderRadius: 5, borderSkipped: false }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return ' ' + fmtFull(c.parsed.x); } } } }, scales: { x: { grid: { color: gc }, ticks: { font: font, callback: function(v) { return fmt(v); } } }, y: { grid: { display: false }, ticks: { font: font } } } } };
      } else cfg = buildHistoCfg(def.col, filtered, font);
    } else if (def.type === 'unique' && def.col) {
      var m4 = agg(filtered, def.col);
      var ks4 = topN(m4, 15), vs4 = ks4.map(function(k) { return m4[k]; });
      cfg = { type: 'bar', data: { labels: ks4, datasets: [{ data: vs4, backgroundColor: COLORS, borderRadius: 5, borderSkipped: false }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return ' ' + c.parsed.y.toLocaleString('pt-BR'); } } } }, scales: { x: { grid: { display: false }, ticks: { font: font, maxRotation: 40 } }, y: { grid: { color: gc }, ticks: { font: font, callback: function(v) { return v.toLocaleString('pt-BR'); } } } } } };
    }
    if (cfg) modalChart = new Chart(ctx, cfg);
  }

  function renderModalTable(def) {
    var head = document.getElementById('modal-thead');
    var body = document.getElementById('modal-tbody');
    var title = document.getElementById('modal-tbl-title');
    head.innerHTML = ''; body.innerHTML = '';
    var rows = [], cols = [];

    if (def.type === 'total') {
      rows = filtered.slice(0, 30);
      cols = COLS.slice(0, 6);
      title.textContent = '📋 Amostra — primeiros 30 registros';
    } else if (def.type === 'sum' || def.type === 'max') {
      rows = filtered.slice().sort(function(a, b) { return (parseFloat(b[def.col]) || 0) - (parseFloat(a[def.col]) || 0); }).slice(0, 25);
      cols = [{ name: def.col, type: 'numeric' }].concat(T.catCols.slice(0, 2).map(function(c) { return { name: c, type: 'varchar' }; }));
      if (T.dateCols.length) cols.push({ name: T.dateCols[0], type: 'date' });
      title.textContent = '📋 Top 25 — Maiores valores de ' + def.col;
    } else if (def.type === 'min') {
      rows = filtered.slice().sort(function(a, b) { return (parseFloat(a[def.col]) || 0) - (parseFloat(b[def.col]) || 0); }).slice(0, 25);
      cols = [{ name: def.col, type: 'numeric' }].concat(T.catCols.slice(0, 2).map(function(c) { return { name: c, type: 'varchar' }; }));
      if (T.dateCols.length) cols.push({ name: T.dateCols[0], type: 'date' });
      title.textContent = '📋 Top 25 — Menores valores de ' + def.col;
    } else if (def.type === 'avg') {
      var avg = filtered.reduce(function(s, r) { return s + (parseFloat(r[def.col]) || 0); }, 0) / (filtered.length || 1);
      rows = filtered.slice().sort(function(a, b) { return Math.abs((parseFloat(a[def.col]) || 0) - avg) - Math.abs((parseFloat(b[def.col]) || 0) - avg); }).slice(0, 25);
      cols = [{ name: def.col, type: 'numeric' }].concat(T.catCols.slice(0, 2).map(function(c) { return { name: c, type: 'varchar' }; }));
      title.textContent = '📋 Registros mais próximos da média (' + fmt(avg) + ')';
    } else if (def.type === 'unique' && def.col) {
      var m5 = agg(filtered, def.col);
      var total5 = filtered.length || 1;
      rows = Object.keys(m5).sort(function(a, b) { return m5[b] - m5[a]; }).map(function(k) { return { valor: k, contagem: m5[k], percentual: pct(m5[k], total5) }; });
      cols = [{ name: 'valor', type: 'varchar' }, { name: 'contagem', type: 'numeric' }, { name: 'percentual', type: 'varchar' }];
      title.textContent = '📋 Todos os valores únicos de ' + def.col;
    }

    var tr = document.createElement('tr');
    cols.forEach(function(col) {
      var th = document.createElement('th');
      th.style.cssText = 'background:#f8fafc;padding:9px 12px;text-align:left;font-weight:600;color:#374151;border-bottom:2px solid #e2e8f0;white-space:nowrap;font-size:12px;font-family:Inter,sans-serif;position:sticky;top:0;z-index:1;';
      th.textContent = col.name;
      tr.appendChild(th);
    });
    head.appendChild(tr);

    rows.forEach(function(row, ri) {
      var tr2 = document.createElement('tr');
      tr2.style.cssText = 'border-bottom:1px solid #f1f5f9;' + (ri % 2 ? 'background:#fafafa;' : '');
      tr2.addEventListener('mouseenter', function() { tr2.style.background = '#f0f9ff'; });
      tr2.addEventListener('mouseleave', function() { tr2.style.background = ri % 2 ? '#fafafa' : ''; });
      cols.forEach(function(col) {
        var td = document.createElement('td');
        td.style.cssText = 'padding:8px 12px;color:#475569;white-space:nowrap;font-size:13px;font-family:Inter,sans-serif;';
        var val = row[col.name];
        if (val == null) { td.textContent = '—'; td.style.color = '#cbd5e1'; }
        else {
          var t = (col.type || '').toLowerCase();
          var isN = t.includes('int') || t.includes('float') || t.includes('double') || t.includes('decimal') || t.includes('numeric') || t === 'numeric';
          if (isN && !isNaN(parseFloat(val))) { td.textContent = fmtFull(parseFloat(val)); td.style.textAlign = 'right'; td.style.fontVariantNumeric = 'tabular-nums'; td.style.color = '#1e293b'; }
          else { td.textContent = String(val); }
        }
        tr2.appendChild(td);
      });
      body.appendChild(tr2);
    });
  }

  /* ── Filters ── */
  function buildFilters() {
    var catFilters = T.catCols.slice(0, 3).filter(function(col) {
      var u = new Set(DATA.map(function(r) { return r[col]; })).size;
      return u >= 2 && u <= 80;
    });
    if (!catFilters.length && !T.dateCols.length) return;
    document.getElementById('filter-card').style.display = '';
    var row = document.getElementById('filter-row');

    catFilters.forEach(function(col) {
      var vals = Array.from(new Set(DATA.map(function(r) { return r[col]; }).filter(function(v) { return v != null; }))).sort(function(a, b) { return String(a).localeCompare(String(b)); });
      var wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;min-width:150px;flex:1;max-width:220px;';
      var lbl = document.createElement('label'); lbl.style.cssText = 'font-size:12px;font-weight:600;color:#475569;font-family:Inter,sans-serif;'; lbl.textContent = col;
      var sel = document.createElement('select'); sel.style.cssText = 'padding:7px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;color:#1e293b;background:#f8fafc;outline:none;cursor:pointer;font-family:Inter,sans-serif;';
      sel.innerHTML = '<option value="">Todos</option>';
      vals.forEach(function(v) { sel.innerHTML += '<option>' + String(v).replace(/</g, '&lt;') + '</option>'; });
      (function(c, s) { s.addEventListener('change', function() { activeFilters[c] = s.value; applyFilters(); }); })(col, sel);
      wrap.appendChild(lbl); wrap.appendChild(sel); row.appendChild(wrap);
    });

    if (T.dateCols.length > 0) {
      var dc = T.dateCols[0];
      ['De', 'Até'].forEach(function(lbl, idx) {
        var wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;min-width:130px;flex:1;max-width:180px;';
        var l = document.createElement('label'); l.style.cssText = 'font-size:12px;font-weight:600;color:#475569;font-family:Inter,sans-serif;'; l.textContent = lbl + ' (' + dc + ')';
        var inp = document.createElement('input'); inp.type = 'date'; inp.id = 'df-' + (idx ? 'end' : 'start');
        inp.style.cssText = 'padding:7px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;color:#1e293b;background:#f8fafc;outline:none;font-family:Inter,sans-serif;';
        inp.addEventListener('change', function() {
          activeFilters['__dc'] = dc;
          var s = document.getElementById('df-start'), e = document.getElementById('df-end');
          activeFilters['__ds'] = s ? s.value : ''; activeFilters['__de'] = e ? e.value : '';
          applyFilters();
        });
        wrap.appendChild(l); wrap.appendChild(inp); row.appendChild(wrap);
      });
    }

    var wrap2 = document.createElement('div'); wrap2.style.cssText = 'display:flex;flex-direction:column;justify-content:flex-end;';
    var btn = document.createElement('button'); btn.style.cssText = 'padding:7px 16px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;cursor:pointer;color:#475569;font-weight:600;white-space:nowrap;font-family:Inter,sans-serif;';
    btn.textContent = '✕ Limpar';
    btn.addEventListener('click', function() {
      row.querySelectorAll('select').forEach(function(s) { s.value = ''; });
      row.querySelectorAll('input').forEach(function(i) { i.value = ''; });
      activeFilters = {}; applyFilters();
    });
    wrap2.appendChild(btn); row.appendChild(wrap2);
  }

  function applyFilters() {
    filtered = DATA.filter(function(row) {
      for (var k in activeFilters) {
        if (k === '__dc' || k === '__ds' || k === '__de') continue;
        if (activeFilters[k] && String(row[k]) !== activeFilters[k]) return false;
      }
      if (activeFilters['__dc'] && (activeFilters['__ds'] || activeFilters['__de'])) {
        var v = row[activeFilters['__dc']];
        if (v) {
          var d = new Date(v);
          if (activeFilters['__ds'] && d < new Date(activeFilters['__ds'])) return false;
          if (activeFilters['__de'] && d > new Date(activeFilters['__de'] + 'T23:59:59')) return false;
        }
      }
      return true;
    });
    PAGE = 1;
    updateKpiValues();
    updateAllCharts();
    renderTable();
  }

  /* ── Charts ── */
  var CHART_DEFS = (function() {
    var defs = [], c1 = T.catCols[0], c2 = T.catCols[1], n1 = T.numCols[0], n2 = T.numCols[1];
    if (c1) defs.push({ id: 'ch1', title: 'Top 10 — ' + c1, type: 'bar', catCol: c1, numCol: n1, icon: '📊', bg: '#eff6ff', fg: '#3b82f6' });
    if (c1) defs.push({ id: 'ch2', title: 'Distribuição — ' + c1, type: 'doughnut', catCol: c1, numCol: n1, icon: '🍩', bg: '#f0fdf4', fg: '#10b981' });
    if (c2) defs.push({ id: 'ch3', title: 'Ranking — ' + c2, type: 'horizontalBar', catCol: c2, numCol: n1, icon: '📉', bg: '#faf5ff', fg: '#8b5cf6' });
    else if (n2) defs.push({ id: 'ch3', title: n1 + ' vs ' + n2, type: 'scatter', numCol: n1, numCol2: n2, icon: '⚡', bg: '#fff7ed', fg: '#f59e0b' });
    else if (c1) defs.push({ id: 'ch3', title: 'Ranking — ' + c1, type: 'horizontalBar', catCol: c1, numCol: n1, icon: '📉', bg: '#faf5ff', fg: '#8b5cf6' });
    var cp = c2 || c1;
    if (cp && n1) defs.push({ id: 'ch4', title: 'Área Polar — ' + cp, type: 'polarArea', catCol: cp, numCol: n1, icon: '🎯', bg: '#fff1f2', fg: '#ef4444' });
    return defs;
  })();

  function buildCharts() {
    var grid = document.getElementById('charts-grid');
    grid.innerHTML = '';
    CHART_DEFS.slice(0, 4).forEach(function(def, i) {
      var card = document.createElement('div');
      card.style.cssText = 'background:white;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08);border:1px solid #e2e8f0;animation:fadeIn .5s ease ' + (i * 0.1 + 0.1) + 's both;';
      card.innerHTML = '<div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:16px;display:flex;align-items:center;gap:8px;font-family:Inter,sans-serif;">'
        + '<span style="width:28px;height:28px;border-radius:8px;background:' + def.bg + ';display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;">' + def.icon + '</span>'
        + def.title + '</div>'
        + '<div style="position:relative;height:250px;"><canvas id="' + def.id + '"></canvas></div>';
      grid.appendChild(card);
    });
    setTimeout(function() { CHART_DEFS.forEach(function(def) { renderChart(def, filtered); }); }, 150);
  }

  function renderChart(def, data) {
    var canvas = document.getElementById(def.id);
    if (!canvas) return;
    if (charts[def.id]) { charts[def.id].destroy(); delete charts[def.id]; }
    var ctx = canvas.getContext('2d');
    var font = { size: 11, family: 'Inter,-apple-system,sans-serif' };
    var gc = '#f1f5f9', cfg;

    if (def.type === 'scatter') {
      cfg = { type: 'scatter', data: { datasets: [{ label: def.numCol + ' x ' + def.numCol2, data: data.slice(0, 300).map(function(r) { return { x: parseFloat(r[def.numCol]) || 0, y: parseFloat(r[def.numCol2]) || 0 }; }), backgroundColor: COLORS[0] + '88', pointRadius: 4, pointHoverRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: def.numCol, font: font }, ticks: { font: font }, grid: { color: gc } }, y: { title: { display: true, text: def.numCol2, font: font }, ticks: { font: font, callback: function(v) { return fmt(v); } }, grid: { color: gc } } } } };
    } else if (def.catCol) {
      var map = def.numCol ? aggNum(data, def.catCol, def.numCol) : agg(data, def.catCol);
      var keys = topN(map, 10), vals = keys.map(function(k) { return map[k]; });
      if (def.type === 'bar') {
        cfg = { type: 'bar', data: { labels: keys, datasets: [{ data: vals, backgroundColor: COLORS, borderRadius: 6, borderSkipped: false }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return ' ' + fmtFull(c.parsed.y); } } } }, scales: { x: { grid: { display: false }, ticks: { font: font, maxRotation: 30 } }, y: { grid: { color: gc }, ticks: { font: font, callback: function(v) { return fmt(v); } } } } } };
      } else if (def.type === 'horizontalBar') {
        cfg = { type: 'bar', data: { labels: keys, datasets: [{ data: vals, backgroundColor: COLORS, borderRadius: 4, borderSkipped: false }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return ' ' + fmtFull(c.parsed.x); } } } }, scales: { x: { grid: { color: gc }, ticks: { font: font, callback: function(v) { return fmt(v); } } }, y: { grid: { display: false }, ticks: { font: font } } } } };
      } else if (def.type === 'doughnut') {
        cfg = { type: 'doughnut', data: { labels: keys, datasets: [{ data: vals, backgroundColor: COLORS, borderWidth: 2, borderColor: 'white', hoverOffset: 8 }] }, options: { cutout: '65%', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom', labels: { font: font, padding: 10, boxWidth: 12 } }, tooltip: { callbacks: { label: function(c) { return ' ' + c.label + ': ' + fmtFull(c.parsed); } } } } } };
      } else if (def.type === 'polarArea') {
        cfg = { type: 'polarArea', data: { labels: keys, datasets: [{ data: vals, backgroundColor: COLORS.map(function(c) { return c + 'aa'; }), borderColor: COLORS, borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom', labels: { font: font, padding: 10, boxWidth: 12 } } } } };
      }
    }
    if (cfg) charts[def.id] = new Chart(ctx, cfg);
  }

  function updateAllCharts() {
    CHART_DEFS.forEach(function(def) { renderChart(def, filtered); });
  }

  /* ── Table ── */
  function renderTable() {
    var searchVal = (document.getElementById('search-inp').value || '').toLowerCase();
    var display = filtered;
    if (searchVal) display = filtered.filter(function(r) { return COLS.some(function(c) { var v = r[c.name]; return v != null && String(v).toLowerCase().includes(searchVal); }); });
    if (sortCol) {
      display = display.slice().sort(function(a, b) {
        var va = a[sortCol], vb = b[sortCol], na = parseFloat(va), nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb)) return (na - nb) * sortDir;
        return String(va || '').localeCompare(String(vb || '')) * sortDir;
      });
    }
    var total = display.length, start = (PAGE - 1) * PAGE_SIZE, end = Math.min(start + PAGE_SIZE, total);
    var page = display.slice(start, end);
    var head = document.getElementById('tbl-head');
    head.innerHTML = '';
    var tr = document.createElement('tr');
    COLS.forEach(function(col) {
      var th = document.createElement('th');
      var arrow = col.name === sortCol ? (sortDir === 1 ? ' ↑' : ' ↓') : '';
      th.style.cssText = 'background:#f8fafc;padding:10px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0;white-space:nowrap;cursor:pointer;user-select:none;font-size:12px;font-family:Inter,sans-serif;color:' + (col.name === sortCol ? '#3b82f6' : '#374151') + ';';
      th.textContent = col.name + arrow;
      (function(cn) { th.addEventListener('click', function() { if (sortCol === cn) sortDir *= -1; else { sortCol = cn; sortDir = 1; } PAGE = 1; renderTable(); }); })(col.name);
      tr.appendChild(th);
    });
    head.appendChild(tr);
    var body = document.getElementById('tbl-body');
    body.innerHTML = '';
    page.forEach(function(row, ri) {
      var tr2 = document.createElement('tr');
      tr2.style.cssText = 'border-bottom:1px solid #f1f5f9;' + (ri % 2 ? 'background:#fafafa;' : '');
      tr2.addEventListener('mouseenter', function() { tr2.style.background = '#f0f9ff'; });
      tr2.addEventListener('mouseleave', function() { tr2.style.background = ri % 2 ? '#fafafa' : ''; });
      COLS.forEach(function(col) {
        var td = document.createElement('td');
        td.style.cssText = 'padding:9px 12px;color:#475569;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;font-size:13px;font-family:Inter,sans-serif;';
        var val = row[col.name];
        if (val == null) { td.textContent = '—'; td.style.color = '#cbd5e1'; }
        else {
          var t = (col.type || '').toLowerCase();
          var isNum = t.includes('int') || t.includes('float') || t.includes('double') || t.includes('decimal') || t.includes('numeric');
          if (isNum && !isNaN(parseFloat(val))) { td.textContent = fmtFull(parseFloat(val)); td.style.textAlign = 'right'; td.style.fontVariantNumeric = 'tabular-nums'; td.style.color = '#1e293b'; }
          else if (val && typeof val === 'object' && val.toISOString) td.textContent = val.toISOString().split('T')[0];
          else td.textContent = String(val);
        }
        tr2.appendChild(td);
      });
      body.appendChild(tr2);
    });
    document.getElementById('page-info').textContent = 'Mostrando ' + (total ? start + 1 : 0) + '–' + end + ' de ' + total.toLocaleString('pt-BR') + ' registros';
    var btns = document.getElementById('page-btns');
    btns.innerHTML = '';
    var totalPages = Math.ceil(total / PAGE_SIZE);
    var bS = 'padding:6px 11px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;cursor:pointer;background:white;color:#374151;font-family:Inter,sans-serif;';
    var bD = 'padding:6px 11px;border:1px solid #f1f5f9;border-radius:6px;font-size:13px;cursor:default;background:#f8fafc;color:#cbd5e1;font-family:Inter,sans-serif;';
    var bA = 'padding:6px 11px;border:1px solid #3b82f6;border-radius:6px;font-size:13px;cursor:pointer;background:#3b82f6;color:white;font-weight:600;font-family:Inter,sans-serif;';
    function mkBtn(text, pg, style, disabled) {
      var b = document.createElement('button'); b.textContent = text; b.style.cssText = style; b.disabled = disabled;
      if (!disabled && pg !== null) b.addEventListener('click', function() { PAGE = pg; renderTable(); });
      btns.appendChild(b);
    }
    mkBtn('← Ant.', PAGE > 1 ? PAGE - 1 : 1, PAGE > 1 ? bS : bD, PAGE <= 1);
    var sp = Math.max(1, PAGE - 2), ep = Math.min(totalPages, PAGE + 2);
    for (var p = sp; p <= ep; p++) mkBtn(String(p), p, p === PAGE ? bA : bS, false);
    mkBtn('Próx. →', PAGE < totalPages ? PAGE + 1 : PAGE, PAGE < totalPages ? bS : bD, PAGE >= totalPages);
  }

  document.getElementById('search-inp').addEventListener('input', function() { PAGE = 1; renderTable(); });

  /* ── Init ── */
  function init() {
    if (!DATA.length) {
      document.getElementById('dash-loading').innerHTML = '<p style="color:#64748b;font-size:14px;font-family:Inter,sans-serif;padding:32px;">Nenhum dado disponível para exibir.</p>';
      return;
    }
    if (typeof Chart !== 'undefined') Chart.defaults.font.family = 'Inter, -apple-system, sans-serif';
    document.getElementById('dash-desc').textContent = DATA.length.toLocaleString('pt-BR') + ' registros · ' + COLS.length + ' colunas · Atualizado agora';
    buildKPIs();
    buildFilters();
    buildCharts();
    renderTable();
    document.getElementById('dash-loading').style.display = 'none';
    document.getElementById('dash-app').style.display = '';
  }

  if (typeof Chart !== 'undefined') {
    init();
  } else {
    var waited = 0;
    var iv = setInterval(function() {
      waited += 100;
      if (typeof Chart !== 'undefined') { clearInterval(iv); init(); }
      else if (waited > 6000) { clearInterval(iv); document.getElementById('dash-loading').innerHTML = '<p style="color:#ef4444;font-family:Inter,sans-serif;padding:32px;">Erro: Chart.js não carregado.</p>'; }
    }, 100);
  }
})();
</script>`;
}

/**
 * Chat: usuário pede criação/alteração do dashboard.
 * Retorna { reply: string, config: object }.
 * O config é um objeto JSON com version:2 que o DashboardRenderer renderiza nativamente.
 */
async function chatDashboard(datasetId, messages, currentConfig = null, modelId = 'gemini-2.0-flash') {
  const columns = await datasetService.getDatasetStructure(datasetId);
  if (!columns.length) throw new Error('Dataset sem estrutura. Execute o dataset primeiro.');

  const defaultConfig = buildDefaultDashboardConfig(columns);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { reply: 'Dashboard gerado. Configure GEMINI_API_KEY para usar o assistente de IA.', config: defaultConfig };
  }

  const schemaText = buildSchemaText(columns);
  const configContext = currentConfig && typeof currentConfig === 'object' && currentConfig.version === 2
    ? `Config atual do dashboard:\n\`\`\`json\n${JSON.stringify(currentConfig, null, 2).slice(0, 6000)}\n\`\`\``
    : 'Ainda não há config. Crie o dashboard do zero baseado nas colunas disponíveis.';

  const systemInstruction = `Você customiza configurações de dashboard BI em JSON. Responda SEMPRE com um único JSON válido:
{ "reply": "mensagem em português ao usuário", "config": { "version": 2, "title": "Título", "kpis": [...], "charts": [...], "filters": [...] } }

Estrutura do config:
- kpis: array de até 6 objetos com { type: "total"|"sum"|"avg"|"unique"|"max"|"min", col?: "nome_exato_coluna", label: "label UI", sub: "subtítulo" }
- charts: array de até 4 objetos com { id: "ch1"|"ch2"|"ch3"|"ch4", title: "título", type: "bar"|"doughnut"|"horizontalBar"|"polarArea"|"scatter", catCol?: "col_categórica", numCol?: "col_numérica", numCol2?: "segunda_col_numérica", icon: "emoji" }
- filters: array de { col: "nome_coluna", type: "select"|"daterange" }

Use APENAS os nomes exatos das colunas do schema. Não invente colunas. Retorne apenas o JSON, sem markdown.`;

  const contents = [];
  const context = `Colunas do dataset (use estes nomes exatos): ${schemaText}\n\n${configContext}\n\nConversa:`;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const role = m.role === 'user' ? 'user' : 'model';
    let text = (m.content || '').trim();
    if (i === 0 && role === 'user') text = context + '\nUsuário: ' + text;
    contents.push({ role, parts: [{ text: text || '(vazio)' }] });
  }
  if (contents.length === 0) contents.push({ role: 'user', parts: [{ text: context }] });

  try {
    const url = `${GEMINI_URL}/${modelId}:generateContent?key=${apiKey}`;
    const payload = {
      contents,
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: 'application/json' },
      systemInstruction: { parts: [{ text: systemInstruction }] },
    };
    const response = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 60000 });
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { reply: 'Dashboard gerado.', config: defaultConfig };

    let cleaned = String(text).trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleaned = jsonMatch[0];

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return { reply: 'Dashboard gerado.', config: defaultConfig };
    }

    const reply = typeof parsed.reply === 'string' ? parsed.reply : 'Dashboard gerado.';
    let config = (parsed.config && typeof parsed.config === 'object') ? parsed.config : null;

    if (config && config.version === 2 && Array.isArray(config.kpis) && Array.isArray(config.charts)) {
      if (!config.columns || !config.columns.length) config.columns = defaultConfig.columns;
      if (!config.detectedTypes) config.detectedTypes = defaultConfig.detectedTypes;
      if (!Array.isArray(config.filters)) config.filters = defaultConfig.filters;
    } else {
      config = defaultConfig;
    }

    return { reply, config };
  } catch (err) {
    console.error('[ai-dashboard] chatDashboard Gemini:', err.message);
    return { reply: 'Dashboard gerado. (Assistente temporariamente indisponível.)', config: defaultConfig };
  }
}

async function getDefaultDashboardConfig(datasetId) {
  const columns = await datasetService.getDatasetStructure(datasetId);
  if (!columns.length) throw new Error('Dataset sem estrutura. Execute o dataset primeiro.');
  return buildDefaultDashboardConfig(columns);
}

async function getDefaultDashboardHtml(datasetId) {
  const columns = await datasetService.getDatasetStructure(datasetId);
  if (!columns.length) throw new Error('Dataset sem estrutura. Execute o dataset primeiro.');
  return buildDefaultDashboardHtml(columns);
}

module.exports = {
  chatDashboard,
  getDefaultDashboardConfig,
  buildDefaultDashboardConfig,
  getDefaultDashboardHtml,
  buildDefaultDashboardHtml,
  buildSchemaText,
};
