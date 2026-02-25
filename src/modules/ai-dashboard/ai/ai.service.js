/**
 * AI Engine - Assistente de dashboards via Gemini.
 * Gera HTML conectado aos dados do dataset (window.DASHBOARD_DATA).
 * Se o Gemini não retornar HTML, usamos um HTML padrão gerado aqui.
 */
const axios = require('axios');
const datasetService = require('../datasets/dataset.service');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const DASHBOARD_EXAMPLE_REFERENCE = `
Use este padrão de página (estilo "Controle de Pendências"):
- HTML5, lang pt-BR, head com: Tailwind CDN (cdn.tailwindcss.com), Chart.js (cdn.jsdelivr.net/npm/chart.js), Font Awesome 6, Google Fonts Inter. Estilos: body font Inter bg cinza claro; .card branco rounded shadow; .loading-spinner (border azul animado); modal e toast com transition.
- body: div container p-4 md:p-6. (1) loading-container: spinner + "Carregando dados...". (2) dashboard-view (hidden até carregar): 
  - Header: h1 título, p descrição.
  - Card filtros: grid com selects (ex: Setor, Responsável, Tipo), inputs type=date (Data Início, Data Fim), botão "Limpar" (fa-undo).
  - Grid 3 KPIs: cards com h3 label e p id kpi-total/kpi-setores etc (números grandes coloridos).
  - Grid principal: coluna esquerda (lg:col-span-1): 2 cards com gráficos Chart.js (bar horizontal, bar horizontal Top 10). Coluna direita (lg:col-span-2): card com tabela (thead sticky, tbody id geral-table-body), rodapé com "Mostrando X a Y de Z" e botões Anterior/Próximo.
  - Card com gráfico doughnut (Chart.js) centralizado.
- Script: dados = window.DASHBOARD_DATA (array); filtrar por selects/datas; agregar por coluna para gráficos; Chart.js type bar indexAxis y e type doughnut; tabela paginada (slice por página); usar nomes EXATOS das colunas do schema. Não use requestQuery - os dados já estão em window.DASHBOARD_DATA.
`;

function buildSchemaText(columns) {
  return columns.map((c) => `${c.name} (${c.type})`).join(', ');
}

/**
 * Gera HTML padrão do dashboard: tabela + gráfico de barras.
 * Não inclui </script> para não quebrar o parser; o buildIframeDoc adiciona o fechamento.
 */
function buildDefaultDashboardHtml(columns) {
  const allNames = columns.map((c) => c.name);
  const colNames = allNames.filter((n) => n !== '_row_id');
  const safeCols = colNames.map((c) => JSON.stringify(c)).join(', ');
  const thCells = colNames.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  return `<div style="padding: 16px; font-family: sans-serif;">
  <h2 style="margin-bottom: 16px;">Dashboard</h2>
  <div id="chartContainer" style="width: 100%; height: 320px; margin-bottom: 24px;"></div>
  <div style="overflow-x: auto;">
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; font-size: 13px;">
      <thead><tr>${thCells}</tr></thead>
      <tbody id="tableBody"></tbody>
    </table>
  </div>
</div>
<script>
(function() {
  var data = window.DASHBOARD_DATA || [];
  var cols = [${safeCols}];
  if (data.length > 0 && cols.length > 0 && data[0][cols[0]] === undefined) {
    cols = Object.keys(data[0]).filter(function(k) { return k !== '_row_id'; });
  }
  var tbody = document.getElementById('tableBody');
  if (tbody) {
    data.slice(0, 500).forEach(function(row) {
      var tr = document.createElement('tr');
      cols.forEach(function(col) {
        var td = document.createElement('td');
        var val = row[col];
        td.textContent = val == null ? '' : (typeof val === 'object' && val.toISOString ? val.toISOString() : String(val));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }
  var chartDom = document.getElementById('chartContainer');
  if (chartDom && typeof echarts !== 'undefined' && data.length > 0 && cols.length >= 1) {
    var map = {};
    data.forEach(function(row) {
      var key = row[cols[0]] != null ? String(row[cols[0]]) : '';
      var num = cols[1] ? row[cols[1]] : 1;
      var v = typeof num === 'number' && !isNaN(num) ? num : parseFloat(num) || 0;
      map[key] = (map[key] || 0) + v;
    });
    var categories = Object.keys(map).slice(0, 30);
    var values = categories.map(function(k) { return map[k]; });
    var chart = echarts.init(chartDom);
    chart.setOption({
      title: { text: (cols[0] || '') + (cols[1] ? ' x ' + cols[1] : ''), left: 'center' },
      tooltip: {},
      xAxis: { type: 'category', data: categories },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: values }]
    });
  }
})();
`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Chat: usuário pede criação/alteração do dashboard.
 * Retorna { reply: string, html: string | null }.
 * Em caso de erro ou Gemini sem HTML, retorna sempre o HTML padrão na primeira vez.
 */
async function chatDashboard(datasetId, messages, currentHtml, modelId = 'gemini-2.0-flash') {
  const columns = await datasetService.getDatasetStructure(datasetId);
  if (!columns.length) throw new Error('Dataset sem estrutura. Execute o dataset primeiro.');

  const defaultHtml = buildDefaultDashboardHtml(columns);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { reply: 'Dashboard gerado. Configure GEMINI_API_KEY para usar o assistente.', html: defaultHtml };
  }

  const schemaText = buildSchemaText(columns);
  const htmlContext = (currentHtml && String(currentHtml).trim())
    ? `HTML atual do dashboard:\n\`\`\`html\n${String(currentHtml).slice(0, 30000)}\n\`\`\``
    : 'Ainda não há HTML. Crie o dashboard do zero.';

  const systemInstruction = `Você gera dashboards em HTML no estilo da referência fornecida. Responda SEMPRE com um único JSON: { "reply": "mensagem em português ao usuário", "html": "HTML completo da página (doctype, head com Tailwind+Chart.js+Fonts, body com loading depois dashboard-view com filtros, KPIs, gráficos Chart.js bar/doughnut, tabela paginada)" }.
Os dados estão em window.DASHBOARD_DATA (array de objetos). Use os nomes EXATOS das colunas do schema nos selects, tabelas e gráficos. Não invente colunas. Chart.js e Tailwind já estarão carregados na página. Retorne apenas o JSON, sem markdown.`;

  const contents = [];
  const context = `Referência de estrutura e estilo que você deve seguir:\n${DASHBOARD_EXAMPLE_REFERENCE}\n\nColunas do dataset (use estes nomes exatos): ${schemaText}\n\n${htmlContext}\n\nConversa:`;
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
    if (!text) return { reply: 'Dashboard gerado.', html: defaultHtml };

    let cleaned = String(text).trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleaned = jsonMatch[0];

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return { reply: 'Dashboard gerado.', html: defaultHtml };
    }

    const reply = typeof parsed.reply === 'string' ? parsed.reply : 'Dashboard gerado.';
    let html = (typeof parsed.html === 'string' ? parsed.html : null) || (typeof parsed.dashboard_html === 'string' ? parsed.dashboard_html : null) || null;
    if (html && typeof html === 'string') {
      html = html.trim().replace(/^```(?:html)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      if (!html) html = null;
    } else {
      html = null;
    }
    if (!html && !currentHtml) html = defaultHtml;
    return { reply, html: html || defaultHtml };
  } catch (err) {
    console.error('[ai-dashboard] chatDashboard Gemini:', err.message);
    return { reply: 'Dashboard gerado. (Assistente indisponível.)', html: defaultHtml };
  }
}

async function getDefaultDashboardHtml(datasetId) {
  const columns = await datasetService.getDatasetStructure(datasetId);
  if (!columns.length) throw new Error('Dataset sem estrutura. Execute o dataset primeiro.');
  return buildDefaultDashboardHtml(columns);
}

module.exports = { chatDashboard, getDefaultDashboardHtml, buildDefaultDashboardHtml, buildSchemaText };
