/**
 * DataCareBI - Handler para dashboards gerados por IA (schema layout/widgets)
 * Suporta carregamento gradual: applyLayout() → updateWidgetsWithData()
 */
const DataCareBI = (function() {
  'use strict';

  const PAGE_SIZE = 20;
  const chartInstances = {};
  let lastPayload = null;
  let chartFilter = null;
  let editModeEnabled = false;
  let onWidgetRemoveCallback = null;
  const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#84CC16', '#6366F1', '#F97316'];
  const CHART_LIMIT = 10;
  const KPI_ICONS = ['fa-chart-line', 'fa-users', 'fa-clock', 'fa-percent', 'fa-coins', 'fa-heart-pulse', 'fa-arrow-trend-up', 'fa-calendar-check'];
  const KPI_GRADIENTS = [
    'from-blue-500 to-blue-600',
    'from-emerald-500 to-teal-600',
    'from-violet-500 to-purple-600',
    'from-amber-500 to-orange-500',
    'from-rose-500 to-pink-600',
    'from-cyan-500 to-blue-500',
    'from-indigo-500 to-blue-600',
    'from-lime-500 to-green-600'
  ];

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function resolveKey(row, key) {
    if (row[key] !== undefined) return row[key];
    const k = Object.keys(row).find((x) => x.toUpperCase() === String(key || '').toUpperCase());
    return k !== undefined ? row[k] : undefined;
  }
  function calculateValue(data, field, op) {
    if (!data || data.length === 0) return (op || '').toLowerCase() === 'count' ? 0 : null;
    const calc = (op || 'sum').toLowerCase();
    if (calc === 'count') return data.length;
    if (calc === 'moda' || calc === 'mode') {
      const freq = {};
      data.forEach(d => {
        const v = resolveKey(d, field);
        const s = (v != null ? String(v) : '').trim() || '—';
        freq[s] = (freq[s] || 0) + 1;
      });
      const ent = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
      return ent ? ent[0] : '—';
    }
    if (calc === 'percent_particular' || calc === 'pct_particular') {
      const total = data.length;
      if (total === 0) return 0;
      const particular = data.filter(d => {
        const v = String(resolveKey(d, field) || '').toLowerCase();
        return v.includes('particular') || v.includes('particulares');
      }).length;
      return total > 0 ? particular / total : 0;
    }
    if (calc === 'distinct') {
      const set = new Set();
      data.forEach(d => { const v = resolveKey(d, field); if (v !== undefined && v !== null) set.add(String(v)); });
      return set.size;
    }
    const nums = data.map(d => {
      const v = resolveKey(d, field);
      const n = typeof v === 'number' ? v : parseFloat(String(v || '').replace(/[^\d.-]/g, ''));
      return isNaN(n) ? 0 : n;
    });
    if (calc === 'avg') return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    return nums.reduce((a, b) => a + b, 0);
  }

  function formatValue(value, format) {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string' && value !== '') return value;
    if (typeof value === 'number' && isNaN(value)) return '—';
    const fmt = (format || 'number').toLowerCase();
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (fmt === 'currency' || fmt === 'brl') return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (fmt === 'days') return num.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' dias';
    if (fmt === 'percent') return (num * 100).toFixed(2).replace('.', ',') + '%';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function isDateValue(val) {
    if (val == null) return false;
    if (val instanceof Date) return true;
    const s = String(val).trim();
    return /^\d{4}-\d{2}-\d{2}/.test(s) || /T\d{2}:\d{2}/.test(s) || /\.\d{3}Z?$/i.test(s);
  }
  function isDateCol(col) {
    if (!col) return false;
    const c = String(col).toUpperCase();
    return /^(DT_|DATA_|DATE_|_DT|_DATA|_DATE)/.test(c) || c.includes('DATA') || c.includes('DT_') || c.includes('DATE');
  }
  function resolveRowKey(row, key) {
    if (row[key] !== undefined) return row[key];
    const k = Object.keys(row).find((x) => x.toUpperCase() === String(key).toUpperCase());
    return k !== undefined ? row[k] : undefined;
  }
  function formatCell(val, col) {
    if (val === null || val === undefined || val === '') return '—';
    if (isDateCol(col) || isDateValue(val)) {
      const d = new Date(val);
      if (isNaN(d.getTime())) return val;
      const pad = (n) => (n < 10 ? '0' : '') + n;
      return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }
    return String(val);
  }

  /** Design System Premium - Cores semânticas OKR (hospitalar) */
  const INTENT_STYLES = {
    POSITIVE: { border: 'border-l-4 border-l-emerald-500', icon: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-600' },
    NEGATIVE: { border: 'border-l-4 border-l-rose-500', icon: 'text-rose-600', badge: 'bg-rose-50 text-rose-600' },
    NEUTRAL: { border: 'border-l-4 border-l-slate-400', icon: 'text-slate-600', badge: 'bg-slate-50 text-slate-600' }
  };
  const INTENT_GRADIENTS = {
    POSITIVE: 'from-emerald-500 to-teal-600',
    NEGATIVE: 'from-rose-500 to-red-600',
    NEUTRAL: 'from-slate-500 to-slate-600',
  };
  function getKpiStyle(data, w, index) {
    const f = (w.field || '').toUpperCase();
    const intent = (w.intent || '').toUpperCase();
    let resolvedIntent = intent || 'NEUTRAL';
    if (!intent && f.includes('DIAS') && f.includes('INTERNACAO')) {
      const val = calculateValue(data, w.field, w.calc || w.op || 'avg');
      if (typeof val === 'number' && val > 15) resolvedIntent = 'NEGATIVE';
    }
    const style = INTENT_STYLES[resolvedIntent] || INTENT_STYLES.NEUTRAL;
    let icon = (w.icon && String(w.icon).startsWith('fa-')) ? w.icon : KPI_ICONS[index % KPI_ICONS.length];
    if (!(w.icon && String(w.icon).startsWith('fa-'))) {
      if (f.includes('META') || f.includes('PERCENT') || (w.calc || '').toLowerCase().includes('percent')) icon = 'fa-dollar-sign';
      if (f.includes('VALOR') || f.includes('VL_') || f.includes('FATURAMENTO')) icon = 'fa-coins';
      if ((w.calc || '').toLowerCase() === 'moda' || (w.label || '').toLowerCase().includes('setor crítico')) icon = 'fa-map-marker-alt';
      if ((w.label || '').toLowerCase().includes('convênio') || (w.label || '').toLowerCase().includes('convenio')) icon = 'fa-first-aid';
    }
    return { gradient: INTENT_GRADIENTS[resolvedIntent], icon, premium: style, intent: resolvedIntent };
  }

  /** Converte config legacy (kpis/charts/table) para widgets; suporta schema UX 2.0 (op, intent) */
  function toWidgets(config) {
    if (config.widgets && config.widgets.length > 0) return config.widgets;
    const w = [];
    (config.kpis || []).forEach(k => w.push({ type: 'kpi', label: k.label, calc: (k.op || k.calc || 'sum').toLowerCase(), field: k.field, format: k.format, intent: k.intent }));
    (config.charts || []).forEach((c, i) => w.push({ type: 'chart', chartType: (c.chartType || c.type || 'bar').toLowerCase(), label: c.label || c.x, value: c.value || c.y, title: c.title, id: c.id || 'chart' + (i + 1) }));
    if (config.table?.show && config.table.columns?.length) w.push({ type: 'table', columns: config.table.columns, limit: config.table.limit });
    return w;
  }

  /** Aplica layout (estrutura sem dados - placeholders) */
  function applyLayout(biConfig, containerId) {
    const cid = containerId || 'dashboard-container';
    const container = document.getElementById(cid);
    if (!container) return;
    const config = biConfig || {};
    if (config.widgets) {
      config.widgets = config.widgets.map((w, i) => ({ ...w, id: w.id || w.type + '-' + i }));
    }
    const header = config.header || {};
    const widgets = toWidgets(config);

    let html = `
      <div class="bi-dashboard-premium" style="font-family: 'Inter', ui-sans-serif, system-ui, sans-serif">
        <div class="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6 rounded-t-lg shadow mb-6">
          <h1 class="text-2xl font-bold tracking-tight">${escapeHtml(header.title || 'Dashboard')}</h1>
          ${header.subtitle ? `<p class="text-blue-100 text-sm mt-1 font-medium">${escapeHtml(header.subtitle)}</p>` : ''}
        </div>
        <div class="p-6" id="bi-widgets-area"></div>
      </div>
    `;
    container.innerHTML = html;

    const area = document.getElementById('bi-widgets-area');
    if (!area) return;

    const kpis = widgets.filter(w => w.type === 'kpi');
    const charts = widgets.filter(w => w.type === 'chart');
    const tables = widgets.filter(w => w.type === 'table');

    if (kpis.length) {
      const grid = document.createElement('div');
      grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6';
      grid.id = 'bi-kpis';
      kpis.forEach((k, i) => {
        const widgetId = k.id || 'kpi-' + i;
        const style = getKpiStyle([], k, i);
        const premium = style.premium || INTENT_STYLES.NEUTRAL;
        const wrapper = document.createElement('div');
        wrapper.className = 'relative bi-widget-wrapper';
        wrapper.dataset.widgetId = widgetId;
        wrapper.dataset.widgetType = 'kpi';
        const ctrlHtml = `<div class="bi-widget-ctrl absolute top-2 right-2 z-10 flex gap-1 ${editModeEnabled ? '' : 'hidden'}">
          <button type="button" class="bi-widget-remove w-7 h-7 rounded bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center text-xs" title="Remover"><i class="fas fa-trash-alt"></i></button>
        </div>`;
        const card = document.createElement('div');
        card.className = `bg-white rounded-xl shadow-sm border border-slate-200 p-6 ${premium.border} hover:shadow-md transition-shadow duration-200 ${k.action ? 'cursor-pointer' : ''}`;
        card.dataset.widgetIndex = String(widgets.indexOf(k));
        card.dataset.action = k.action || '';
        const actionBtn = (k.action) ? `<div class="mt-3"><button type="button" class="text-xs font-medium ${premium.badge} px-2 py-1 rounded transition hover:opacity-90" data-smart-action="${escapeHtml(k.action)}"><i class="fas fa-arrow-right mr-1"></i>${escapeHtml(k.action)}</button></div>` : '';
        card.innerHTML = `${ctrlHtml}<div class="flex items-start justify-between"><div class="flex-1 min-w-0"><h3 class="text-sm font-medium text-slate-600 tracking-tight">${escapeHtml(k.label)}</h3><p class="bi-kpi-value text-2xl font-bold text-slate-900 tracking-tight mt-2">—</p>${actionBtn}</div><div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ml-3 ${premium.badge}"><i class="fas bi-kpi-icon ${style.icon} ${premium.icon}"></i></div></div>`;
        wrapper.appendChild(card);
        grid.appendChild(wrapper);
      });
      area.appendChild(grid);
    }

    if (charts.length) {
      const grid = document.createElement('div');
      grid.className = 'grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6';
      grid.id = 'bi-charts';
      charts.forEach((ch, i) => {
        const chartId = ch.id || 'chart' + (i + 1);
        const widgetId = ch.id || 'chart-' + (i + 1);
        const isDoughnut = (ch.chartType || ch.style || '').toLowerCase() === 'doughnut';
        const hint = ch.hint || (isDoughnut ? 'Clique em uma fatia para filtrar o detalhamento' : 'Gráfico interativo com seleção de dados');
        const wrapper = document.createElement('div');
        wrapper.className = 'relative bi-widget-wrapper';
        wrapper.dataset.widgetId = widgetId;
        wrapper.dataset.widgetType = 'chart';
        const ctrlHtml = `<div class="bi-widget-ctrl absolute top-2 right-2 z-10 flex gap-1 ${editModeEnabled ? '' : 'hidden'}">
          <button type="button" class="bi-widget-remove w-7 h-7 rounded bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center text-xs" title="Remover"><i class="fas fa-trash-alt"></i></button>
        </div>`;
        const div = document.createElement('div');
        div.className = 'bg-white rounded-xl shadow-sm border border-slate-200 p-4';
        div.innerHTML = `${ctrlHtml}<div class="flex items-center justify-between mb-4"><h3 class="text-base font-bold text-slate-900 tracking-tight">${escapeHtml(ch.title || ch.label || 'Gráfico')}</h3><button type="button" class="bi-reset-filters text-xs text-blue-600 hover:text-blue-800 font-medium" data-chart-id="${escapeHtml(chartId)}">Resetar Filtros</button></div><div class="bi-chart-placeholder bg-slate-50 rounded flex items-center justify-center h-[350px] w-full"><span class="text-slate-400 text-sm">Carregando...</span></div><div class="bi-chart-container hidden" style="position:relative;height:350px;width:100%"><canvas id="${chartId}"></canvas></div><p class="text-xs text-slate-500 mt-2 italic">* ${escapeHtml(hint)}</p>`;
        wrapper.appendChild(div);
        grid.appendChild(wrapper);
      });
      area.appendChild(grid);
    }

    if (tables.length) {
      tables.forEach((t, i) => {
        const widgetId = t.id || 'table-' + i;
        const outer = document.createElement('div');
        outer.className = 'relative bi-widget-wrapper';
        outer.dataset.widgetId = widgetId;
        outer.dataset.widgetType = 'table';
        const ctrlHtml = `<div class="bi-widget-ctrl absolute top-2 right-2 z-10 flex gap-1 ${editModeEnabled ? '' : 'hidden'}">
          <button type="button" class="bi-widget-remove w-7 h-7 rounded bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center text-xs" title="Remover"><i class="fas fa-trash-alt"></i></button>
        </div>`;
        const wrapper = document.createElement('div');
        wrapper.className = 'bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6';
        wrapper.innerHTML = `${ctrlHtml}<div class="p-4 border-b border-slate-100"><h3 class="text-base font-bold text-slate-900 tracking-tight">Detalhamento</h3></div><div class="bi-table-placeholder h-48 bg-slate-50 rounded flex items-center justify-center"><span class="text-slate-400 text-sm">Carregando dados...</span></div><div id="bi-table-container" class="hidden"></div>`;
        outer.appendChild(wrapper);
        area.appendChild(outer);
      });
    }
    attachWidgetRemoveHandlers(container);
  }

  function attachWidgetRemoveHandlers(container) {
    if (!container) return;
    container.querySelectorAll('.bi-widget-remove').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const wrapper = btn.closest('.bi-widget-wrapper');
        if (!wrapper) return;
        const id = wrapper.dataset.widgetId;
        const type = wrapper.dataset.widgetType;
        if (onWidgetRemoveCallback) onWidgetRemoveCallback(id, type);
      };
    });
  }

  /** Aplica filtro de clique no chart (Master-Detail) */
  function applyChartFilter(rawData) {
    if (!chartFilter || !rawData || !Array.isArray(rawData)) return rawData || [];
    return rawData.filter(r => {
      const v = resolveKey(r, chartFilter.field);
      const cv = chartFilter.value;
      return v == cv || String(v || '').toLowerCase() === String(cv || '').toLowerCase();
    });
  }

  /** Preenche widgets com dados reais */
  function updateWidgetsWithData(biConfig, data, containerId) {
    lastPayload = { biConfig, data, containerId };
    const displayData = applyChartFilter(data);
    const cid = containerId || 'dashboard-container';
    const container = document.getElementById(cid);
    if (!container || !data || !Array.isArray(data) || data.length === 0) return;

    const config = biConfig || {};
    const widgets = toWidgets(config);
    const kpis = widgets.filter(w => w.type === 'kpi');
    const charts = widgets.filter(w => w.type === 'chart');
    const tables = widgets.filter(w => w.type === 'table');

    if (kpis.length) {
      const grid = container.querySelector('#bi-kpis');
      if (grid) {
        kpis.forEach((k, i) => {
          const card = grid.children[i];
          if (card) {
            const val = calculateValue(displayData, k.field, k.calc || (k.op && k.op.toLowerCase()) || 'sum');
            const fmt = formatValue(val, k.format);
            const style = getKpiStyle(data, k, i);
            const premium = style.premium || INTENT_STYLES.NEUTRAL;
            card.className = `bg-white rounded-xl shadow-sm border border-slate-200 p-6 ${premium.border} hover:shadow-md transition-shadow duration-200 ${k.action ? 'cursor-pointer' : ''}`;
            card.dataset.action = k.action || '';
            const valueEl = card.querySelector('.bi-kpi-value, p');
            if (valueEl) valueEl.textContent = fmt;
            const iconEl = card.querySelector('.bi-kpi-icon, .rounded-lg i');
            if (iconEl) iconEl.className = `fas ${style.icon} ${premium.icon}`;
            const actionBtn = card.querySelector('[data-smart-action]');
            if (actionBtn && k.action) actionBtn.textContent = k.action;
          }
        });
      }
    }

    if (charts.length && window.Chart) {
      function resolveCol(row, key) {
        if (row[key] !== undefined) return row[key];
        const k = Object.keys(row).find((x) => x.toUpperCase() === String(key).toUpperCase());
        return k !== undefined ? row[k] : undefined;
      }
      charts.forEach((ch, i) => {
        const firstRow = displayData[0] || {};
        const labelCol = Object.keys(firstRow).find((k) => k.toUpperCase() === String(ch.label || ch.xAxis || '').toUpperCase()) || ch.label || ch.xAxis;
        const valueCol = Object.keys(firstRow).find((k) => k.toUpperCase() === String(ch.value || ch.yAxis || '').toUpperCase()) || ch.value || ch.yAxis || ch.label;
        const limit = ch.limit || CHART_LIMIT;
        let labels = displayData.map((d) => resolveCol(d, labelCol) ?? '');
        let values = displayData.map((d) => { const v = resolveCol(d, valueCol); return typeof v === 'number' ? v : parseFloat(v) || 0; });
        if (labels.length > limit) {
          const indices = values.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, limit).map(x => x.i);
          labels = indices.map(i => labels[i]);
          values = indices.map(i => values[i]);
        }

        const chartId = ch.id || 'chart' + (i + 1);
        const canvas = document.getElementById(chartId);
        const container = canvas?.closest('.bi-chart-container');
        const placeholder = container?.previousElementSibling;
        if (placeholder) placeholder.classList.add('hidden');
        if (container) container.style.display = 'block';
        if (canvas) {
          if (chartInstances[chartId]) {
            chartInstances[chartId].destroy();
            chartInstances[chartId] = null;
          }
          const chartType = (ch.chartType || 'bar').toLowerCase();
          const isArea = chartType === 'line' && ch.style === 'area';
          const isBarHorizontal = chartType === 'bar' && labels.length > 5 && !ch.verticalBar;
          const barColors = labels.map((_, j) => (COLORS[j % COLORS.length]) + 'CC');
          const ds = {
            label: ch.title || valueCol,
            data: values,
            backgroundColor: chartType === 'pie' || chartType === 'doughnut' ? COLORS.slice(0, Math.min(values.length, 6)) : barColors,
            borderColor: COLORS[0],
            borderWidth: 2,
            fill: isArea,
            tension: isArea ? 0.3 : 0
          };
          const options = {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            plugins: {
              legend: { display: chartType === 'pie' || chartType === 'doughnut' },
              tooltip: chartType !== 'bar' && ch.action ? { callbacks: { afterLabel: () => '👆 Clique para ' + (ch.action || 'detalhar') } } : {}
            },
            indexAxis: isBarHorizontal ? 'y' : undefined,
            onClick: ch.action ? (evt, els) => {
              if (els && els.length) {
                const idx = els[0].index;
                const lbl = labels[idx];
                chartFilter = { field: ch.detailField || ch.xAxis || ch.label, value: lbl };
                updateWidgetsWithData(lastPayload.biConfig, lastPayload.data, lastPayload.containerId);
                window.DataCareBI?.handleSmartAction?.(ch.action, { label: lbl, value: values[idx], index: idx });
              }
            }
          };
          if (chartType !== 'pie' && chartType !== 'doughnut') {
            options.scales = { y: { beginAtZero: true } };
          }
          let pieLabels = labels;
          let pieValues = values;
          if ((chartType === 'doughnut' || chartType === 'pie') && labels.length > 6) {
            const sorted = labels.map((l, j) => ({ l, v: values[j] })).sort((a, b) => b.v - a.v).slice(0, 6);
            pieLabels = sorted.map(x => x.l);
            pieValues = sorted.map(x => x.v);
            ds.backgroundColor = COLORS.slice(0, 6);
          }
          chartInstances[chartId] = new Chart(canvas.getContext('2d'), {
            type: chartType === 'doughnut' ? 'doughnut' : chartType,
            data: {
              labels: chartType === 'doughnut' || chartType === 'pie' ? pieLabels : labels,
              datasets: [{ ...ds, data: chartType === 'doughnut' || chartType === 'pie' ? pieValues : values }]
            },
            options
          });
        }
      });
    }

    if (tables.length) {
      const tbl = tables[0];
      const containerEl = document.getElementById('bi-table-container');
      const tableWrapper = containerEl?.closest('.bg-white');
      const placeholder = tableWrapper?.querySelector('.bi-table-placeholder');
      if (placeholder) placeholder.classList.add('hidden');
      if (containerEl) {
        containerEl.classList.remove('hidden');
        const cols = tbl.columns || [];
        const limit = tbl.limit || PAGE_SIZE;
        const slice = displayData.slice(0, limit);
        containerEl.innerHTML = `
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50"><tr>${cols.map(c => { const key = typeof c === 'string' ? c : (c.field || c); const label = (tbl.columnLabels || {})[key] || key; return `<th class="px-4 py-3 text-left font-semibold text-slate-600">${escapeHtml(label)}</th>`; }).join('')}</tr></thead>
              <tbody>${slice.map(row => `<tr class="border-b border-slate-100">${cols.map(c => { const key = typeof c === 'string' ? c : (c.field || c); return `<td class="px-4 py-2">${escapeHtml(formatCell(resolveRowKey(row, key), key))}</td>`; }).join('')}</tr>`).join('')}</tbody>
            </table>
          </div>
        `;
      }
    }

    container.querySelectorAll('.bi-reset-filters').forEach(btn => {
      btn.onclick = () => {
        chartFilter = null;
        if (lastPayload) updateWidgetsWithData(lastPayload.biConfig, lastPayload.data, lastPayload.containerId);
      };
    });
  }

  /** Render completo (layout + dados de uma vez) */
  function render(config, data, containerId) {
    applyLayout(config, containerId);
    updateWidgetsWithData(config, data, containerId);
  }

  function redirectForm(formId, params) {
    if (typeof window.redirectForm === 'function') window.redirectForm(formId, params);
    else if (window.parent !== window && window.parent.postMessage) window.parent.postMessage({ type: 'redirectForm', formId, params }, '*');
  }

  /** Smart Action handler - integração com SaaS (abrir fila, auditoria, etc) */
  function handleSmartAction(actionName, context) {
    if (typeof window.onDataCareSmartAction === 'function') {
      window.onDataCareSmartAction(actionName, context);
      return;
    }
    console.log('[DataCareBI] Smart Action:', actionName, context);
  }

  /** Anexa listeners para Smart Actions nos widgets */
  function attachSmartActions(biConfig, containerId) {
    const cid = containerId || 'dashboard-container';
    const container = document.getElementById(cid);
    if (!container) return;
    const kpis = (toWidgets(biConfig || {})).filter(w => w.type === 'kpi');
    const grid = container.querySelector('#bi-kpis');
    if (!grid) return;
    kpis.forEach((k, i) => {
      if (!k.action) return;
      const card = grid.children[i];
      if (card) {
        card.addEventListener('click', () => handleSmartAction(k.action, { type: 'kpi', label: k.label, field: k.field }));
      }
    });
  }

  /**
   * Renderização instantânea via Auto-Discovery (zero IA, zero hardcoding).
   * Analisa a primeira amostra e monta dashboard em milissegundos.
   * @param {Array} data - Dados da query
   * @param {string} containerId - ID do container
   * @param {Object} options - { title, subtitle }
   */
  function renderAutoDiscovery(data, containerId, options = {}) {
    if (!data || !Array.isArray(data) || data.length === 0) return false;
    if (typeof window.DataCareAutoDiscovery === 'undefined') {
      console.warn('[DataCareBI] DataCareAutoDiscovery não carregado - use render() com biConfig');
      return false;
    }
    const biConfig = DataCareAutoDiscovery.analyzeAndToBiConfig(data, options);
    if (!biConfig) return false;
    render(biConfig, data, containerId);
    return true;
  }

  function resetChartFilters(containerId) {
    chartFilter = null;
    if (lastPayload) updateWidgetsWithData(lastPayload.biConfig, lastPayload.data, containerId || lastPayload.containerId);
  }

  function setEditMode(enabled) {
    editModeEnabled = !!enabled;
    document.querySelectorAll('.bi-widget-ctrl').forEach(el => el.classList.toggle('hidden', !editModeEnabled));
  }

  return {
    render, renderAutoDiscovery, applyLayout, updateWidgetsWithData,
    calculateValue, formatValue, redirectForm, handleSmartAction, attachSmartActions,
    resetChartFilters, setEditMode,
    get onWidgetRemove() { return onWidgetRemoveCallback; },
    set onWidgetRemove(fn) { onWidgetRemoveCallback = typeof fn === 'function' ? fn : null; }
  };
})();

if (typeof window !== 'undefined') window.DataCareBI = DataCareBI;
if (typeof module !== 'undefined' && module.exports) module.exports = DataCareBI;
