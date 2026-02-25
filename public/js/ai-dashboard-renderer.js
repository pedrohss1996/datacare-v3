/**
 * AI Dashboard Renderer - Interpreta config_json e renderiza gráficos (ECharts) e cards/tabela.
 * Tipos: line, bar, pie, donut, area, card, table.
 * options: { customColors: [] } - escala de cores (hex) usada em todos os gráficos.
 */
(function(global) {
  'use strict';

  var PALETTE_GREEN = ['#0d9488', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4', '#5b8a72', '#4d7c6a'];

  function getPalette(config, customColors) {
    if (Array.isArray(customColors) && customColors.length) return customColors;
    return config.palette === 'green' ? PALETTE_GREEN : undefined;
  }

  function sanitizeCategory(val) {
    if (val == null || val === '') return '';
    var s = String(val).trim();
    if (!s) return '';
    var iso = /^\d{4}-\d{2}-\d{2}(T|\s)/.exec(s);
    if (iso) {
      var d = new Date(s);
      if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    if (/^\d+$/.test(s) && s.length > 8) return s.length > 10 ? s.slice(0, 6) + '…' : s;
    if (s.length > 20) return s.slice(0, 18) + '…';
    return s;
  }

  function sanitizeCategories(arr) {
    return (arr || []).map(sanitizeCategory);
  }

  var MESES_ORDEM = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  function sortCategoriesAsMonths(cats) {
    var order = {};
    MESES_ORDEM.forEach(function(m, i) { order[m.toLowerCase()] = i; });
    return cats.slice().sort(function(a, b) {
      var ia = order[String(a).toLowerCase()];
      var ib = order[String(b).toLowerCase()];
      if (ia != null && ib != null) return ia - ib;
      if (ia != null) return -1;
      if (ib != null) return 1;
      return String(a).localeCompare(b);
    });
  }

  function getSeriesGroupedBy(data, xKey, groupKey, valueKey, op) {
    var opLower = (op || 'avg').toLowerCase();
    var map = {};
    var xValues = {};
    var groupValues = {};
    data.forEach(function(row) {
      var xVal = row[xKey] != null ? String(row[xKey]) : '';
      var gVal = row[groupKey] != null ? String(row[groupKey]) : '';
      var v = row[valueKey];
      var num = typeof v === 'number' && !isNaN(v) ? v : parseFloat(v);
      if (!map[xVal]) map[xVal] = {};
      if (!map[xVal][gVal]) map[xVal][gVal] = [];
      map[xVal][gVal].push(isNaN(num) ? 0 : num);
      xValues[xVal] = true;
      groupValues[gVal] = true;
    });
    var categories = sortCategoriesAsMonths(Object.keys(xValues));
    var groups = Object.keys(groupValues).sort();
    var series = groups.map(function(g) {
      var values = categories.map(function(cat) {
        var arr = map[cat] && map[cat][g] ? map[cat][g] : [];
        if (!arr.length) return 0;
        if (opLower === 'sum') return arr.reduce(function(a, b) { return a + b; }, 0);
        return arr.reduce(function(a, b) { return a + b; }, 0) / arr.length;
      });
      return { name: g, data: values };
    });
    return { categories: categories, series: series };
  }

  function getSeries(data, xKey, yKeys, op) {
    const opLower = (op || 'sum').toLowerCase();
    if (!xKey || !yKeys || !yKeys.length) return { categories: [], series: [] };
    const map = {};
    data.forEach(function(row) {
      const xVal = row[xKey] != null ? String(row[xKey]) : '';
      if (!map[xVal]) map[xVal] = {};
      yKeys.forEach(function(yKey) {
        const v = row[yKey];
        const num = typeof v === 'number' && !isNaN(v) ? v : parseFloat(v);
        if (!map[xVal][yKey]) map[xVal][yKey] = [];
        if (opLower === 'count') map[xVal][yKey].push(1);
        else if (opLower === 'avg') map[xVal][yKey].push(isNaN(num) ? 0 : num);
        else map[xVal][yKey].push(isNaN(num) ? 0 : num);
      });
    });
    const categories = Object.keys(map).sort();
    const series = yKeys.map(function(yKey) {
      const values = categories.map(function(cat) {
        const arr = map[cat] && map[cat][yKey] ? map[cat][yKey] : [];
        if (opLower === 'count') return arr.length;
        if (opLower === 'avg') return arr.length ? arr.reduce(function(a, b) { return a + b; }, 0) / arr.length : 0;
        return arr.reduce(function(a, b) { return a + b; }, 0);
      });
      return { name: yKey, data: values };
    });
    return { categories, series };
  }

  function renderLine(container, config, data, options) {
    const x = config.x;
    const y = Array.isArray(config.y) ? config.y : [config.y];
    const g = getSeries(data, x, y, config.op || 'sum');
    const colors = getPalette(config, options && options.customColors);
    const option = {
      title: config.title ? { text: config.title, left: 'center', top: 0, textStyle: { fontSize: 14 } } : undefined,
      color: colors,
      tooltip: { trigger: 'axis' },
      legend: { data: y, bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '15%', top: config.title ? '14%' : '10%', containLabel: true },
      xAxis: { type: 'category', data: sanitizeCategories(g.categories), boundaryGap: false },
      yAxis: { type: 'value' },
      series: g.series.map(function(s) { return { name: s.name, type: 'line', data: s.data, smooth: true }; })
    };
    if (config.title) {
      var titleEl = document.createElement('h3');
      titleEl.className = 'text-base font-semibold text-slate-800 mb-2';
      titleEl.textContent = config.title;
      container.appendChild(titleEl);
    }
    var div = document.createElement('div');
    div.style.width = '100%';
    div.style.height = '320px';
    container.appendChild(div);
    var chart = global.echarts.init(div);
    chart.setOption(option);
    global.addEventListener('resize', function() { chart.resize(); });
  }

  function renderBar(container, config, data, options) {
    const x = config.x;
    const y = Array.isArray(config.y) ? config.y : [config.y];
    var g;
    if (config.groupBy && y.length === 1 && data && data.length) {
      g = getSeriesGroupedBy(data, x, config.groupBy, y[0], config.op || 'avg');
    } else {
      g = getSeries(data, x, y, config.op || 'sum');
    }
    const colors = getPalette(config, options && options.customColors);
    const labelsOnBars = config.labelsOnBars === true;
    const formatPercent = config.formatPercent === true;
    const labelFormatter = formatPercent ? function(params) { return (params.value != null ? params.value.toFixed(2) : '') + '%'; } : '{c}';
    const series = g.series.map(function(s, i) {
      const ser = { name: s.name, type: 'bar', data: s.data };
      if (labelsOnBars) ser.label = { show: true, position: 'top', formatter: labelFormatter };
      return ser;
    });
    const option = {
      title: config.title ? { text: config.title, left: 'center', top: 0, textStyle: { fontSize: 14, fontWeight: 600 } } : undefined,
      tooltip: { trigger: 'axis', formatter: formatPercent ? function(params) { var s = (params && params[0]) ? params[0].axisValue + '<br/>' : ''; (params || []).forEach(function(p) { s += (p.marker || '') + ' ' + (p.seriesName || '') + ': ' + (p.value != null ? Number(p.value).toFixed(2) : '') + '%<br/>'; }); return s; } : undefined },
      color: colors,
      legend: { data: y, bottom: 0, left: 'center' },
      grid: { left: '3%', right: '4%', bottom: config.title ? '18%' : '15%', top: config.title ? '14%' : '10%', containLabel: true },
      xAxis: { type: 'category', data: sanitizeCategories(g.categories) },
      yAxis: { type: 'value', axisLabel: formatPercent ? { formatter: '{value}%' } : undefined, max: formatPercent ? 100 : undefined },
      series: series
    };
    if (config.title) {
      var titleEl = document.createElement('h3');
      titleEl.className = 'text-base font-semibold text-slate-800 mb-2';
      titleEl.textContent = config.title;
      container.appendChild(titleEl);
    }
    var div = document.createElement('div');
    div.style.width = '100%';
    div.style.height = config.title ? '380px' : '320px';
    container.appendChild(div);
    var chart = global.echarts.init(div);
    chart.setOption(option);
    global.addEventListener('resize', function() { chart.resize(); });
  }

  function buildPieData(config, data) {
    const xKey = config.x;
    const yKey = Array.isArray(config.y) ? config.y[0] : config.y;
    const map = {};
    data.forEach(function(row) {
      const cat = row[xKey] != null ? sanitizeCategory(String(row[xKey])) : '';
      const val = yKey && row[yKey] != null ? (typeof row[yKey] === 'number' ? row[yKey] : parseFloat(row[yKey]) || 0) : 1;
      map[cat] = (map[cat] || 0) + val;
    });
    return Object.keys(map).map(function(k) { return { name: k, value: map[k] }; }).sort(function(a, b) { return b.value - a.value; }).slice(0, 12);
  }

  function renderPie(container, config, data, options) {
    const pieData = buildPieData(config, data || []);
    const colors = getPalette(config, options && options.customColors);
    var div = document.createElement('div');
    div.style.width = '100%';
    div.style.height = '320px';
    container.appendChild(div);
    var chart = global.echarts.init(div);
    chart.setOption({
      color: colors,
      tooltip: { trigger: 'item' },
      legend: { orient: 'vertical', right: 10, top: 'center' },
      series: [{ type: 'pie', radius: ['40%', '70%'], data: pieData, emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' } } }]
    });
    global.addEventListener('resize', function() { chart.resize(); });
  }

  function renderDonut(container, config, data, options) {
    const pieData = buildPieData(config, data || []);
    const colors = getPalette(config, options && options.customColors);
    var div = document.createElement('div');
    div.style.width = '100%';
    div.style.height = '320px';
    container.appendChild(div);
    var chart = global.echarts.init(div);
    chart.setOption({
      color: colors,
      tooltip: { trigger: 'item' },
      legend: { orient: 'vertical', right: 10, top: 'center' },
      series: [{ type: 'pie', radius: ['45%', '70%'], center: ['40%', '50%'], data: pieData, label: { show: true }, emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' } } }]
    });
    global.addEventListener('resize', function() { chart.resize(); });
  }

  function renderArea(container, config, data, options) {
    const x = config.x;
    const y = Array.isArray(config.y) ? config.y : [config.y];
    const g = getSeries(data, x, y, config.op || 'sum');
    const colors = getPalette(config, options && options.customColors);
    const option = {
      title: config.title ? { text: config.title, left: 'center', top: 0, textStyle: { fontSize: 14 } } : undefined,
      color: colors,
      tooltip: { trigger: 'axis' },
      legend: { data: y, bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '15%', top: config.title ? '14%' : '10%', containLabel: true },
      xAxis: { type: 'category', data: sanitizeCategories(g.categories), boundaryGap: false },
      yAxis: { type: 'value' },
      series: g.series.map(function(s) { return { name: s.name, type: 'line', data: s.data, smooth: true, areaStyle: {} }; })
    };
    if (config.title) {
      var titleEl = document.createElement('h3');
      titleEl.className = 'text-base font-semibold text-slate-800 mb-2';
      titleEl.textContent = config.title;
      container.appendChild(titleEl);
    }
    var div = document.createElement('div');
    div.style.width = '100%';
    div.style.height = '320px';
    container.appendChild(div);
    var chart = global.echarts.init(div);
    chart.setOption(option);
    global.addEventListener('resize', function() { chart.resize(); });
  }

  function renderCard(container, config, data) {
    const field = config.field;
    const op = (config.op || 'count').toLowerCase();
    const label = config.label || field || 'Total';
    var value;
    if (op === 'count') value = data.length;
    else if (op === 'sum' && field) {
      value = data.reduce(function(acc, row) {
        var n = row[field];
        if (typeof n !== 'number') n = parseFloat(n);
        return acc + (isNaN(n) ? 0 : n);
      }, 0);
    } else if (op === 'avg' && field) {
      var sum = data.reduce(function(acc, row) {
        var n = row[field];
        if (typeof n !== 'number') n = parseFloat(n);
        return acc + (isNaN(n) ? 0 : n);
      }, 0);
      value = data.length ? sum / data.length : 0;
    } else value = data.length;
    var card = document.createElement('div');
    card.className = 'border border-slate-200 rounded-xl p-4 bg-slate-50';
    card.innerHTML = '<div class="text-sm text-slate-600">' + escapeHtml(label) + '</div><div class="text-2xl font-bold text-slate-800 mt-1">' + formatNumber(value) + '</div>';
    container.appendChild(card);
  }

  function renderTable(container, config, data) {
    var cols = config.columns;
    if (!Array.isArray(cols) || !cols.length) cols = data.length ? Object.keys(data[0]) : [];
    var limit = Math.min(config.limit || 50, 100);
    var slice = data.slice(0, limit);
    var table = document.createElement('div');
    table.className = 'overflow-x-auto border border-slate-200 rounded-lg';
    var html = '<table class="min-w-full text-sm"><thead><tr class="bg-slate-100">';
    cols.forEach(function(c) { html += '<th class="px-4 py-2 text-left font-medium text-slate-700">' + escapeHtml(c) + '</th>'; });
    html += '</tr></thead><tbody>';
    slice.forEach(function(row, i) {
      html += '<tr class="' + (i % 2 ? 'bg-slate-50' : '') + '">';
      cols.forEach(function(col) { html += '<td class="px-4 py-2 text-slate-800">' + escapeHtml(row[col] != null ? String(row[col]) : '') + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table>';
    table.innerHTML = html;
    container.appendChild(table);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function formatNumber(n) {
    if (typeof n !== 'number' || isNaN(n)) return '-';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    if (Number.isInteger(n)) return n.toLocaleString('pt-BR');
    return n.toFixed(2).replace('.', ',');
  }

  var typeMap = {
    line: renderLine,
    bar: renderBar,
    pie: renderPie,
    donut: renderDonut,
    area: renderArea,
    card: renderCard,
    table: renderTable
  };

  function render(containerEl, config, data, options) {
    if (!containerEl || !config) return;
    var layout = config.layout;
    if (!Array.isArray(layout) || !layout.length) {
      containerEl.innerHTML = '<p class="text-slate-500">Nenhum widget na configuração.</p>';
      return;
    }
    containerEl.innerHTML = '';
    options = options || {};

    var header = config.header;
    if (header && (header.title || (header.filters && header.filters.length))) {
      var headerEl = document.createElement('div');
      headerEl.className = 'bg-white rounded-xl border border-slate-200 p-4 mb-6';
      var html = '';
      if (header.title) html += '<h2 class="text-xl font-bold text-slate-800 mb-4">' + escapeHtml(header.title) + '</h2>';
      if (header.filters && header.filters.length) {
        header.filters.forEach(function(f) {
          if (f.type === 'dateRange' && f.label) {
            html += '<div class="flex flex-wrap items-center gap-2"><span class="text-sm font-medium text-slate-600">' + escapeHtml(f.label) + '</span>';
            html += '<input type="date" class="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" id="filter-date-start">';
            html += '<span class="text-slate-400">até</span>';
            html += '<input type="date" class="border border-slate-200 rounded-lg px-3 py-1.5 text-sm" id="filter-date-end">';
            html += '</div>';
          }
        });
      }
      headerEl.innerHTML = html;
      containerEl.appendChild(headerEl);
    }

    var grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
    containerEl.appendChild(grid);

    layout.forEach(function(item) {
      var type = (item.type || '').toLowerCase();
      var renderFn = typeMap[type];
      var cell = document.createElement('div');
      if (type === 'line' || type === 'bar' || type === 'pie' || type === 'donut' || type === 'area') cell.className = 'lg:col-span-2';
      else if (type === 'table') cell.className = 'lg:col-span-3';
      else cell.className = '';
      if (type === 'bar' && item.title) cell.className = 'lg:col-span-3';
      if (renderFn) {
        try { renderFn(cell, item, data || [], options); } catch (e) { cell.innerHTML = '<p class="text-red-500 text-sm">Erro: ' + escapeHtml(e.message) + '</p>'; }
      } else {
        cell.innerHTML = '<p class="text-slate-500 text-sm">Tipo não suportado: ' + escapeHtml(type) + '</p>';
      }
      grid.appendChild(cell);
    });
  }

  global.AIDashboardRenderer = { render: render };
})(typeof window !== 'undefined' ? window : this);
