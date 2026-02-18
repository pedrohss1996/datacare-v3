// ARQUIVO: src/controllers/AnalyticsController.js

const { GoogleGenAI } = require('@google/genai');
const db = require('../infra/database/connection');
const QueryOptimizer = require('../utils/queryOptimizer');
const QueryStreamer = require('../utils/queryStreamer');
const performanceMonitor = require('../utils/performanceMonitor');
const cacheDashboards = require('../utils/cacheDashboards');
const crypto = require('crypto');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODELOS_ANALYTICS = ['gemini-3-flash-preview', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-exp-1206'];
function getModeloAnalytics(modeloSelecionado) {
    const id = (modeloSelecionado && String(modeloSelecionado).trim()) || '';
    return MODELOS_ANALYTICS.includes(id) ? id : 'gemini-3-flash-preview';
}

/** Extrai o template (substitui dados embutidos por {{DB_DATA}}) para envio à IA em edições */
function stripDataFromHtml(html, data) {
    if (!html || !data) return html;
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    if (html.includes(dataStr)) return html.replace(dataStr, '{{DB_DATA}}');
    const idx = html.indexOf('window.DB_DATA');
    if (idx === -1) return html;
    const start = html.indexOf('[', idx);
    if (start === -1) return html;
    let depth = 1;
    let i = start + 1;
    while (i < html.length && depth > 0) {
        const c = html[i];
        if (c === '[' || c === '{') depth++;
        else if (c === ']' || c === '}') depth--;
        i++;
    }
    return html.slice(0, start) + '{{DB_DATA}}' + html.slice(i);
}

/** Monta o prompt do usuário considerando OKRs e geração automática */
function buildUserPrompt(prompt, okrContext, autoGenerateOKRs) {
    const promptBase = 'Crie um dashboard completo com KPIs, gráficos e insights';
    if (autoGenerateOKRs && !prompt) {
        return 'Analise os dados carregados e crie os melhores indicadores (KPIs) para acompanhar OKRs. Gere um dashboard com: (1) Cards de KPIs principais no topo, (2) Gráficos que mostrem tendências e comparações, (3) Visualizações adequadas aos tipos de dados (temporal=linha, categórico=barra, percentual=pizza). Priorize indicadores mensuráveis e acionáveis.';
    }
    if (okrContext && okrContext.trim()) {
        const ctx = okrContext.trim();
        return prompt ? `Contexto OKRs: "${ctx}". ${prompt}` : `Contexto das OKRs: "${ctx}". Crie os melhores KPIs e indicadores para acompanhar esses objetivos.`;
    }
    return prompt || promptBase;
}
/**
 * Prompt especializado para geração de indicadores alinhados a OKRs (Objetivos e Resultados Chave).
 * Usado quando o usuário carrega dados e deseja indicadores automáticos para acompanhar metas.
 */
const okrKpiExpertContext = `
    CONTEXTO OKRs (Objetivos e Resultados Chave):
    Você deve criar um dashboard de indicadores que sirva como painel de acompanhamento de OKRs.
    - KPIs devem ser mensuráveis, acionáveis e alinhados a objetivos de negócio
    - Priorize indicadores que mostrem progresso, tendências e comparações
    - Use nomes claros e descritivos (ex: "Taxa de Ocupação", "Faturamento Acumulado")
    - Inclua meta/baseline quando fizer sentido (ex: "Meta: 85%" ou "vs. mês anterior")
    - Organize os indicadores por importância: principais no topo, detalhamentos abaixo
`;

const sqlExpertContext = `
    Você é um DBA Oracle Sênior.
    REGRAS OBRIGATÓRIAS:
    1. Datas: TRUNC(SYSDATE) ou TO_CHAR(data, 'HH24').
    2. Group By: Obrigatório para colunas não agregadas.
    3. Limite: SEMPRE use WHERE ROWNUM <= 1000 ou FETCH FIRST 1000 ROWS ONLY.
    4. NUNCA faça SELECT * sem WHERE ou LIMIT - isso pode quebrar o sistema.
    5. SEMPRE filtre por período recente (últimos 30 dias, mês atual, ano atual).
    6. SAÍDA: Apenas SQL puro, otimizado e limitado.
    
    EXEMPLO CORRETO:
    SELECT 
        cd_setor,
        nm_setor,
        COUNT(*) as total_pacientes
    FROM conta_paciente
    WHERE dt_entrada >= TRUNC(SYSDATE - 30)
    GROUP BY cd_setor, nm_setor
    FETCH FIRST 500 ROWS ONLY
`;

/**
 * SYSTEM INSTRUCTION - Motor DataCare Analytics (HTML mode)
 * Define persona, design e código. Temperature 0.2 evita alucinações.
 */
const SYSTEM_INSTRUCTION_HTML = `Você é o motor de inteligência do DataCare Analytics. Sua função é gerar TEMPLATES HTML de dashboards hospitalares. O backend injetará os dados — NUNCA inclua dados no seu output.

REGRA CRÍTICA - SEPARAÇÃO DE RESPONSABILIDADES:
- Você gera APENAS o esqueleto: HTML + CSS + JS.
- Use o placeholder exato: {{DB_DATA}} (o backend fará .replace com os dados reais).
- NUNCA escreva JSON/dados no HTML. NUNCA invente valores.
- Em um <script>, inclua: window.DB_DATA = {{DB_DATA}}; e após, chame window.initDashboard() no load.
- O placeholder {{DB_DATA}} será substituído pelo backend por um array JSON.

Stack Tecnológica (versões fixas):
- Tailwind CSS v3.4.1: design e layout responsivo (CDN JIT). Use classes utilitárias; nunca CSS inline.
- Chart.js v4.4.1: gráficos interativos. Inclua Doughnut para distribuições e Bar para volumes por categoria.
- FontAwesome v6.0.0: ícones nos cards de KPI e interface.
- JavaScript ES6+ (Vanilla JS): filter, map, reduce, Arrow Functions; sem jQuery.

Diretrizes de Design:
- Crie cards de KPI com ícones do FontAwesome. Cada card deve ter um título, valor principal e subtexto.
- Paleta: Slate e Blue (sistemas SaaS médicos).
- Tabela de detalhamento responsiva com hover.

Diretrizes de Código:
- Gere HTML único e auto-contido.
- Lógica de filtragem em Vanilla JS, manipulando window.DB_DATA (array injetado pelo backend).
- Todo código de renderização em window.initDashboard = function() { ... }.
- OBRIGATÓRIO: no script, use window.DB_DATA = {{DB_DATA}}; — o backend substituirá {{DB_DATA}}.
- NUNCA coloque dados no output; use sempre window.DB_DATA.
- Ao final do script, execute initDashboard: if (document.readyState==='complete') initDashboard(); else window.addEventListener('load',initDashboard);
- Use as colunas EXATAS do metadata.colunas (Oracle retorna UPPERCASE: SETOR, CONVENIO, VALOR).

Tom de Voz: Técnico, preciso e focado em escalabilidade.`;

/**
 * CONTEXTO BI (legado): "REAL-TIME CALCULATION MODE + INTERATIVIDADE"
 * Usado como fallback quando SYSTEM_INSTRUCTION_HTML não for suficiente.
 */
const biExpertContext = `
    Você é um Engenheiro de BI e Frontend Sênior especializado em dashboards hospitalares INTERATIVOS.
    
    SUA MISSÃO:
    Criar um Dashboard HTML COMPLETO, INTERATIVO e RESPONSIVO que processe 'window.DB_DATA' para gerar visualizações profissionais.
    
    🚫 PROIBIÇÕES ABSOLUTAS:
    1. NUNCA coloque dados JSON hardcoded no código
    2. NUNCA escreva números estáticos no HTML (Ex: <span>R$ 1.000</span>)
    3. NUNCA invente dados ou valores fictícios
    4. NUNCA use bibliotecas externas além das especificadas
    5. NUNCA use chartjs-plugin-datalabels ou ChartDataLabels (não está disponível)
    6. NUNCA use plugins do Chart.js além dos nativos
    7. NUNCA mencione "mock", "dados fictícios" ou "exemplo" - os dados são REAIS do sistema Tasy (sistema hospitalar)
    8. NUNCA adicione badges, tags ou textos dizendo "Mock", "Exemplo" ou "Demonstração"
    
    🎯 FUNCIONALIDADES INTERATIVAS (IMPLEMENTAR QUANDO SOLICITADO):
    
    A. **FILTROS DINÂMICOS**:
       Quando o usuário pedir "filtros", "botão direito para filtrar", "menu de contexto":
       
       1. Crie um menu de contexto personalizado:
       
       <div id="contextMenu" class="hidden fixed bg-white shadow-2xl rounded-lg border border-slate-200 z-50 p-2 min-w-[200px]">
           <div class="text-xs font-bold text-slate-600 px-3 py-2 border-b border-slate-100">Filtros Rápidos</div>
           <button onclick="aplicarFiltro('todos')" class="w-full text-left px-3 py-2 hover:bg-blue-50 rounded text-sm">
               <i class="fas fa-check-circle text-green-500 mr-2"></i>Mostrar Todos
           </button>
           <button onclick="aplicarFiltro('top10')" class="w-full text-left px-3 py-2 hover:bg-blue-50 rounded text-sm">
               <i class="fas fa-trophy text-yellow-500 mr-2"></i>Top 10
           </button>
           <button onclick="aplicarFiltro('maior100')" class="w-full text-left px-3 py-2 hover:bg-blue-50 rounded text-sm">
               <i class="fas fa-filter text-blue-500 mr-2"></i>Valores > 100
           </button>
       </div>
       
       2. JavaScript para ativar menu de contexto:
       
       document.addEventListener('contextmenu', function(e) {
           e.preventDefault();
           const menu = document.getElementById('contextMenu');
           menu.style.left = e.pageX + 'px';
           menu.style.top = e.pageY + 'px';
           menu.classList.remove('hidden');
       });
       
       document.addEventListener('click', function() {
           document.getElementById('contextMenu').classList.add('hidden');
       });
       
       function aplicarFiltro(tipo) {
           let dadosFiltrados = [...window.DB_DATA];
           
           if (tipo === 'top10') {
               dadosFiltrados = dadosFiltrados.sort((a, b) => b.VALOR - a.VALOR).slice(0, 10);
           } else if (tipo === 'maior100') {
               dadosFiltrados = dadosFiltrados.filter(item => item.VALOR > 100);
           }
           
           // Atualiza gráficos e KPIs com dados filtrados
           atualizarDashboard(dadosFiltrados);
       }
    
    B. **DRILL-DOWN (CLIQUE NO GRÁFICO)**:
       Quando o usuário pedir "clique no gráfico", "drill-down", "detalhamento":
       
       1. Adicione onClick nos gráficos Chart.js:
       
       const chartConfig = {
           type: 'bar',
           data: {...},
           options: {
               onClick: (event, elements) => {
                   if (elements.length > 0) {
                       const index = elements[0].index;
                       const label = labels[index];
                       const valor = valores[index];
                       
                       // Mostra modal com detalhes
                       mostrarDetalhamento(label, valor, index);
                   }
               },
               responsive: true,
               plugins: {
                   tooltip: {
                       callbacks: {
                           afterLabel: function(context) {
                               return '👆 Clique para ver detalhes';
                           }
                       }
                   }
               }
           }
       };
       
       2. Função de detalhamento:
       
       function mostrarDetalhamento(categoria, valor, index) {
           // Filtra dados relacionados à categoria clicada
           const detalhes = window.DB_DATA.filter(item => item.CATEGORIA === categoria);
           
           // Cria modal com tabela detalhada
           const modal = document.createElement('div');
           modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
           modal.innerHTML = \`
               <div class="bg-white rounded-xl shadow-2xl p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                   <div class="flex justify-between items-center mb-4">
                       <h3 class="text-xl font-bold text-slate-800">
                           <i class="fas fa-chart-bar text-blue-600 mr-2"></i>
                           Detalhamento: \${categoria}
                       </h3>
                       <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-red-500">
                           <i class="fas fa-times text-xl"></i>
                       </button>
                   </div>
                   
                   <div class="bg-blue-50 p-4 rounded-lg mb-4">
                       <p class="text-sm text-blue-700">
                           <b>Total:</b> \${valor.toLocaleString('pt-BR')} | 
                           <b>Registros:</b> \${detalhes.length}
                       </p>
                   </div>
                   
                   <div class="overflow-x-auto">
                       <table class="w-full text-sm">
                           <thead class="bg-slate-100">
                               <tr>
                                   \${Object.keys(detalhes[0]).map(col => 
                                       \`<th class="px-4 py-2 text-left font-semibold text-slate-700">\${col}</th>\`
                                   ).join('')}
                               </tr>
                           </thead>
                           <tbody>
                               \${detalhes.map(row => \`
                                   <tr class="border-b border-slate-100 hover:bg-slate-50">
                                       \${Object.values(row).map(val => 
                                           \`<td class="px-4 py-2">\${val}</td>\`
                                       ).join('')}
                                   </tr>
                               \`).join('')}
                           </tbody>
                       </table>
                   </div>
               </div>
           \`;
           
           document.body.appendChild(modal);
       }
    
    C. **FILTROS POR PERÍODO**:
       Quando pedir "filtro de data", "período", "range":
       
       <div class="bg-white p-4 rounded-lg shadow mb-6">
           <label class="text-sm font-bold text-slate-700 mb-2 block">Filtrar por Período:</label>
           <div class="flex gap-3">
               <input type="date" id="dataInicio" class="border border-slate-300 rounded px-3 py-2 text-sm">
               <input type="date" id="dataFim" class="border border-slate-300 rounded px-3 py-2 text-sm">
               <button onclick="filtrarPorPeriodo()" class="bg-blue-600 text-white px-4 py-2 rounded font-semibold text-sm">
                   <i class="fas fa-filter mr-2"></i>Aplicar
               </button>
           </div>
       </div>
       
       function filtrarPorPeriodo() {
           const inicio = new Date(document.getElementById('dataInicio').value);
           const fim = new Date(document.getElementById('dataFim').value);
           
           const dadosFiltrados = window.DB_DATA.filter(item => {
               const data = new Date(item.DATA);
               return data >= inicio && data <= fim;
           });
           
           atualizarDashboard(dadosFiltrados);
       }
    
    D. **BUSCA/PESQUISA**:
       Quando pedir "busca", "pesquisa", "search":
       
       <div class="mb-6">
           <div class="relative">
               <input type="text" 
                      id="searchInput" 
                      onkeyup="buscarDados()" 
                      placeholder="Buscar..." 
                      class="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg">
               <i class="fas fa-search absolute left-3 top-3 text-slate-400"></i>
           </div>
       </div>
       
       function buscarDados() {
           const termo = document.getElementById('searchInput').value.toLowerCase();
           const dadosFiltrados = window.DB_DATA.filter(item => 
               Object.values(item).some(val => 
                   String(val).toLowerCase().includes(termo)
               )
           );
           atualizarDashboard(dadosFiltrados);
       }
    
    E. **EXPORTAR DADOS**:
       Quando pedir "exportar", "download", "CSV":
       
       <button onclick="exportarCSV()" class="bg-green-600 text-white px-4 py-2 rounded font-semibold">
           <i class="fas fa-download mr-2"></i>Exportar CSV
       </button>
       
       function exportarCSV() {
           const csv = [
               Object.keys(window.DB_DATA[0]).join(','),
               ...window.DB_DATA.map(row => Object.values(row).join(','))
           ].join('\\n');
           
           const blob = new Blob([csv], { type: 'text/csv' });
           const url = URL.createObjectURL(blob);
           const a = document.createElement('a');
           a.href = url;
           a.download = 'dashboard_data.csv';
           a.click();
       }
    
    📊 **FUNÇÃO AUXILIAR OBRIGATÓRIA** (sempre inclua):
    
    // Função para atualizar todo o dashboard com novos dados
    function atualizarDashboard(dadosNovos) {
        // Atualiza KPIs
        const total = dadosNovos.reduce((acc, item) => acc + (Number(item.VALOR) || 0), 0);
        const elemTotal = document.getElementById('kpi-total');
        if (elemTotal) elemTotal.textContent = total.toLocaleString('pt-BR');
        
        // Atualiza gráficos (destruir e recriar)
        if (window.chartInstances) {
            window.chartInstances.forEach(chart => chart.destroy());
        }
        window.chartInstances = [];
        
        // Recria gráficos com novos dados
        criarGraficos(dadosNovos);
    }
    
    ✅ OBRIGAÇÕES (CÁLCULO 100% DINÂMICO):
    
    1. **KPIs PRINCIPAIS** (Cards no topo - SEM QUEBRA DE LAYOUT):
       - HTML CORRETO (com classes de overflow):
       
       <div class="bg-white p-6 rounded-lg shadow-lg hover:shadow-xl transition-shadow">
           <div class="flex items-center justify-between mb-3">
               <h3 class="text-sm font-semibold text-slate-600 uppercase tracking-wide truncate">Total Geral</h3>
               <i class="fas fa-chart-line text-blue-500 text-xl"></i>
           </div>
           <div class="kpi-value text-3xl font-bold text-blue-600 mb-2" id="kpi-total">
               Carregando...
           </div>
           <p class="text-xs text-slate-500 truncate">Atualizado em tempo real</p>
       </div>
       
       - JS OBRIGATÓRIO (dentro de window.initDashboard):
       
       // Dentro de window.initDashboard()
       const dados = window.DB_DATA || [];
       
       // KPI 1: Total
       const total = dados.reduce((acc, item) => acc + (Number(item.VALOR) || 0), 0);
       const elemTotal = document.getElementById('kpi-total');
       if (elemTotal) {
           elemTotal.textContent = total.toLocaleString('pt-BR');
           console.log('✅ KPI Total atualizado:', total);
       }
       
       // KPI 2: Média
       const media = total / dados.length;
       const elemMedia = document.getElementById('kpi-media');
       if (elemMedia) {
           elemMedia.textContent = media.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
           console.log('✅ KPI Média atualizado:', media);
       }
       
       - Crie de 3 a 6 KPIs relevantes baseados nos dados
       - Use cores: blue-600, green-600, purple-600, orange-600
       - SEMPRE use classes: truncate, overflow-hidden, text-overflow-ellipsis
       - SEMPRE adicione ícones Font Awesome para visual profissional
    
    2. **GRÁFICOS PROFISSIONAIS**:
       - **Gráfico de Barras**: Para comparações (Ex: por mês, por categoria)
       - **Gráfico de Linha**: Para tendências temporais
       - **Gráfico de Pizza/Donut**: Para distribuições percentuais
       - **Gráfico de Área**: Para volumes acumulados
       
       Exemplo:
       const labels = window.DB_DATA.map(item => item.MES || item.CATEGORIA);
       const valores = window.DB_DATA.map(item => item.TOTAL || item.VALOR);
       
       new Chart(document.getElementById('chart1').getContext('2d'), {
           type: 'bar',
           data: {
               labels: labels,
               datasets: [{
                   label: 'Volume',
                   data: valores,
                   backgroundColor: 'rgba(59, 130, 246, 0.5)',
                   borderColor: 'rgba(59, 130, 246, 1)',
                   borderWidth: 2
               }]
           },
           options: {
               responsive: true,
               maintainAspectRatio: false,
               plugins: {
                   legend: { display: true, position: 'top' },
                   tooltip: {
                       callbacks: {
                           label: function(context) {
                               return context.dataset.label + ': ' + context.parsed.y.toLocaleString('pt-BR');
                           }
                       }
                   }
               },
               scales: {
                   y: { 
                       beginAtZero: true, 
                       ticks: { 
                           callback: (v) => v.toLocaleString('pt-BR') 
                       } 
                   }
               }
           }
       });

    3. **TABELA DE DADOS** (Opcional):
       - Se tiver mais de 10 registros, crie uma tabela scrollável
       - Use Tailwind: table-auto, overflow-x-auto
       - Mostre no máximo 20 linhas iniciais

    4. **TRATAMENTO DE ERROS**:
       if (!window.DB_DATA || window.DB_DATA.length === 0) {
           document.body.innerHTML = '<div class="flex items-center justify-center h-screen"><div class="text-center"><i class="fas fa-exclamation-triangle text-6xl text-yellow-500 mb-4"></i><p class="text-xl text-slate-600">Nenhum dado encontrado</p></div></div>';
           return;
       }

    5. **FORMATAÇÃO**:
       - Números: .toLocaleString('pt-BR')
       - Moeda: .toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})
       - Datas: new Date(valor).toLocaleDateString('pt-BR')
       - Percentuais: (valor * 100).toFixed(2) + '%'

    ESTRUTURA OBRIGATÓRIA:
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard BI - DataCare</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
            /* Estilos globais para evitar quebra de layout */
            * {
                box-sizing: border-box;
            }
            
            /* Previne overflow de texto em cards e containers */
            .card-title, .kpi-title, h1, h2, h3, h4, h5, h6 {
                overflow: hidden;
                text-overflow: ellipsis;
                word-wrap: break-word;
                hyphens: auto;
            }
            
            /* Limita largura de textos longos */
            .text-content {
                max-width: 100%;
                overflow-wrap: break-word;
                word-break: break-word;
            }
            
            /* Garante que números não quebrem o layout */
            .kpi-value, .metric-value {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            /* Tabelas responsivas */
            .table-container {
                overflow-x: auto;
                max-width: 100%;
            }
            
            /* Modais sempre no topo */
            .modal-overlay {
                position: fixed;
                inset: 0;
                z-index: 9999;
            }
            
            /* Cursor pointer em elementos clicáveis */
            .clickable {
                cursor: pointer;
            }
            
            /* Animações suaves */
            .fade-in {
                animation: fadeIn 0.3s ease-in;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
        </style>
    </head>
    <body class="bg-slate-100">
        <!-- HEADER -->
        <div class="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6 shadow-lg">
            <h1 class="text-3xl font-bold">Dashboard de Análise</h1>
            <p class="text-blue-100 text-sm mt-1">Dados em tempo real do sistema Tasy</p>
        </div>
        
        <div class="container mx-auto p-6">
            <!-- GRID DE KPIs (3 ou 4 colunas) -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                [SEU CÓDIGO DE KPIs AQUI COM IDs ÚNICOS]
            </div>
            
            <!-- GRID DE GRÁFICOS (2 colunas) -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div class="bg-white p-6 rounded-lg shadow-lg">
                    <h3 class="text-lg font-bold text-slate-700 mb-4">Gráfico 1</h3>
                    <div class="h-80"><canvas id="chart1"></canvas></div>
                </div>
                <div class="bg-white p-6 rounded-lg shadow-lg">
                    <h3 class="text-lg font-bold text-slate-700 mb-4">Gráfico 2</h3>
                    <div class="h-80"><canvas id="chart2"></canvas></div>
                </div>
            </div>
            
            <!-- GRÁFICO FULL WIDTH (se necessário) -->
            <div class="bg-white p-6 rounded-lg shadow-lg mb-6">
                <h3 class="text-lg font-bold text-slate-700 mb-4">Análise Temporal</h3>
                <div class="h-96"><canvas id="chart3"></canvas></div>
            </div>
        </div>
        
        <script>
            // ============================================
            // VARIÁVEIS GLOBAIS
            // ============================================
            window.chartInstances = window.chartInstances || [];
            window.dadosOriginais = window.dadosOriginais || window.DB_DATA || [];
            
            // ============================================
            // FUNÇÃO PRINCIPAL DE INICIALIZAÇÃO
            // ============================================
            window.initDashboard = function() {
                console.log('🎯 [Dashboard] initDashboard() chamado');
                
                const dados = window.DB_DATA || [];
                
                console.log('✅ [Dashboard] DOM Pronto');
                console.log('📊 [Dashboard] Dados disponíveis:', dados.length, 'registros');
                
                if (dados.length === 0) {
                    console.error('❌ [Dashboard] Nenhum dado encontrado!');
                    document.body.innerHTML = '<div class="flex items-center justify-center h-screen"><div class="text-center"><i class="fas fa-exclamation-triangle text-6xl text-yellow-500 mb-4"></i><p class="text-xl text-slate-600">Nenhum dado encontrado</p></div></div>';
                    return;
                }
                
                console.log('🔍 [Dashboard] Primeiro registro:', dados[0]);
                console.log('📋 [Dashboard] Colunas:', Object.keys(dados[0]));
                
                // Limpa gráficos anteriores se existirem
                if (window.chartInstances && window.chartInstances.length > 0) {
                    console.log('🧹 [Dashboard] Destruindo gráficos anteriores...');
                    window.chartInstances.forEach(chart => {
                        if (chart && typeof chart.destroy === 'function') {
                            chart.destroy();
                        }
                    });
                    window.chartInstances = [];
                }
                
                // [SEU CÓDIGO DE PROCESSAMENTO E GRÁFICOS AQUI]
                // IMPORTANTE: Sempre adicione os gráficos ao array global
                // EXEMPLO:
                // const chart1 = new Chart(ctx, config);
                // window.chartInstances.push(chart1);
                
                // SEMPRE use getElementById ou querySelector antes de atribuir valores
                // SEMPRE verifique se o elemento existe antes de modificar
                // EXEMPLO:
                // const elemento = document.getElementById('kpi-total');
                // if (elemento) {
                //     const total = dados.reduce((acc, item) => acc + Number(item.TOTAL || 0), 0);
                //     elemento.textContent = total.toLocaleString('pt-BR');
                // }
            };
            
            // ============================================
            // FUNÇÃO AUXILIAR PARA ATUALIZAR DASHBOARD
            // ============================================
            window.atualizarDashboard = function(dadosNovos) {
                console.log('🔄 [Dashboard] Atualizando com novos dados...');
                window.DB_DATA = dadosNovos;
                window.initDashboard();
            };
            
            // ============================================
            // INICIALIZAÇÃO MÚLTIPLA (garante execução)
            // ============================================
            
            // Método 1: DOMContentLoaded
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() {
                    console.log('📍 [Dashboard] DOMContentLoaded disparado');
                    setTimeout(window.initDashboard, 100);
                });
            } else {
                // DOM já está pronto
                console.log('📍 [Dashboard] DOM já pronto, executando imediatamente');
                setTimeout(window.initDashboard, 100);
            }
            
            // Método 2: Window Load (fallback)
            window.addEventListener('load', function() {
                console.log('📍 [Dashboard] Window load disparado');
                if (window.DB_DATA && window.DB_DATA.length > 0) {
                    setTimeout(window.initDashboard, 200);
                }
            });
            
            // Método 3: Timeout forçado (último recurso)
            setTimeout(function() {
                if (window.DB_DATA && window.DB_DATA.length > 0) {
                    console.log('⏰ [Dashboard] Fallback timeout: executando após 800ms');
                    window.initDashboard();
                }
            }, 800);
        </script>
    </body>
    </html>

    🎨 BOAS PRÁTICAS DE CÓDIGO:
    
    1. **Armazene instâncias de gráficos globalmente**:
       window.chartInstances = [];
       const chart1 = new Chart(...);
       window.chartInstances.push(chart1);
    
    2. **Crie funções reutilizáveis**:
       function criarGraficos(dados) { ... }
       function atualizarKPIs(dados) { ... }
       function aplicarFiltro(tipo) { ... }
    
    3. **Use event delegation para performance**:
       document.addEventListener('click', function(e) {
           if (e.target.matches('.btn-filtro')) { ... }
       });
    
    4. **Adicione feedback visual**:
       - Cursor pointer em elementos clicáveis
       - Hover effects (hover:bg-blue-50)
       - Loading states quando processar dados
       - Tooltips informativos
    
    5. **Responsividade**:
       - Use grid-cols-1 md:grid-cols-2 lg:grid-cols-4
       - Gráficos com maintainAspectRatio: false
       - Tabelas com overflow-x-auto
    
    6. **Acessibilidade**:
       - Botões com aria-label
       - Títulos descritivos
       - Cores com bom contraste
    
    📝 ESTRUTURA DE CÓDIGO RECOMENDADA:
    
    <script>
        // 1. VARIÁVEIS GLOBAIS
        window.chartInstances = [];
        window.dadosOriginais = [];
        
        // 2. FUNÇÃO PRINCIPAL
        window.initDashboard = function() {
            const dados = window.DB_DATA || [];
            if (dados.length === 0) return;
            
            window.dadosOriginais = [...dados];
            
            // Inicializa componentes
            criarKPIs(dados);
            criarGraficos(dados);
            criarTabela(dados);
            inicializarFiltros();
        };
        
        // 3. FUNÇÕES DE CRIAÇÃO
        function criarKPIs(dados) { ... }
        function criarGraficos(dados) { ... }
        function criarTabela(dados) { ... }
        
        // 4. FUNÇÕES DE INTERAÇÃO
        function aplicarFiltro(tipo) { ... }
        function mostrarDetalhamento(categoria) { ... }
        function buscarDados() { ... }
        
        // 5. FUNÇÕES AUXILIARES
        function atualizarDashboard(dadosNovos) { ... }
        function formatarValor(valor, tipo) { ... }
        
        // 6. INICIALIZAÇÃO
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', window.initDashboard);
        } else {
            setTimeout(window.initDashboard, 100);
        }
    </script>
    
    🎯 QUANDO O USUÁRIO PEDIR FUNCIONALIDADES ESPECÍFICAS:
    
    - "filtros" ou "botão direito" → Implemente menu de contexto (seção A)
    - "clique no gráfico" ou "drill-down" → Implemente onClick no Chart.js (seção B)
    - "filtro de data" ou "período" → Implemente date inputs (seção C)
    - "busca" ou "pesquisa" → Implemente search input (seção D)
    - "exportar" ou "download" → Implemente função de export (seção E)
    - "tabela detalhada" → Crie tabela HTML com todos os dados
    - "gráfico interativo" → Adicione onClick, hover effects e tooltips
    
    ⚠️ ATENÇÃO ESPECIAL:
    - SEMPRE teste se elementos existem antes de manipular (if (elemento) {...})
    - SEMPRE use console.log para debug
    - SEMPRE formate números com .toLocaleString('pt-BR')
    - SEMPRE destrua gráficos antigos antes de criar novos (chart.destroy())
    - SEMPRE mantenha uma cópia dos dados originais para resetar filtros
    
    IMPORTANTE:
    - Use Chart.js v4.4.1 syntax
    - Cores do DataCare: blue-600 (primária), green-600, purple-600, orange-600
    - Grid responsivo: mobile-first
    - Sombras suaves: shadow-lg
    - Animações: transition-all duration-300
    - Font Awesome 6.4.0 para ícones
    
    📊 ORIGEM DOS DADOS:
    - Os dados em window.DB_DATA são REAIS, extraídos do sistema Tasy (Philips Healthcare)
    - Tasy é um sistema de gestão hospitalar completo usado em hospitais brasileiros
    - Os dados contêm informações reais de atendimentos, pacientes, exames, prontuários, etc.
    - NUNCA adicione textos como "Dados Mock", "Exemplo" ou similares
    - Os dashboards são para uso profissional em ambiente hospitalar real
    
    SAÍDA:
    Retorne APENAS o código HTML completo (incluindo <!DOCTYPE html>).
    Não adicione explicações, apenas o código pronto para uso.
`;

const analyticsController = {

    index: async (req, res) => {
        try {
            let savedWidgets = [];
            let pastas = [];
            
            try { 
                // Busca QUERIES salvas (sem pasta) para o Query Manager
                // Prioriza tabela saved_queries, fallback para config_indicadores
                const hasSavedQueries = await db.schema.hasTable('saved_queries');
                
                if (hasSavedQueries) {
                    savedWidgets = await db('saved_queries')
                        .orderBy('created_at', 'desc')
                        .select(
                            'id', 
                            'title', 
                            'description',
                            'sql_query as oracle_sql_query',
                            'created_at'
                        );
                } else {
                    // Fallback: busca queries de config_indicadores (tipo_grafico = 'query_only')
                    savedWidgets = await db('config_indicadores')
                        .where('ativo', true)
                        .whereIn('tipo_grafico', ['query_only', 'analytics_query'])
                        .whereNull('pasta_id')  // Queries não têm pasta
                        .orderBy('id', 'desc')
                        .select(
                            'id', 
                            'titulo as title', 
                            'descricao as description', 
                            'query_sql as oracle_sql_query',
                            'created_at'
                        );
                }
                
                console.log(`[Analytics] ${savedWidgets.length} queries carregadas para o Query Manager`);
                
                // Busca pastas disponíveis para salvar DASHBOARDS (não queries!)
                pastas = await db('indicadores_pastas')
                    .where('ativo', true)
                    .orderBy('ordem', 'asc')
                    .orderBy('nome', 'asc')
                    .select('id', 'nome', 'descricao', 'icone', 'cor_hex');
                
                console.log(`[Analytics] ${pastas.length} pastas disponíveis para dashboards`);
                    
            } catch (e) {
                console.error('[Analytics] Erro ao carregar dados:', e);
            }
            
            res.render('pages/analytics/index', { 
                title: 'Construtor IA', 
                user: req.user, 
                savedWidgets,  // Queries salvas (Query Manager)
                pastas,        // Pastas para salvar dashboards
                hideFooter: true
            });
        } catch (error) {
            console.error(error);
            res.status(500).render('pages/500', { 
                title: 'Erro no Servidor',
                error, 
                user: req.user 
            });
        }
    },

    preview: async (req, res) => {
        console.log('\n========================================');
        console.log('📥 [ANALYTICS PREVIEW] Request recebido');
        console.log('========================================');
        
        try {
            let { prompt, sqlQuery, model: modelId, okrContext, autoGenerateOKRs, outputFormat, contexto: ctxFromBody, currentHtml, rawResult: rawResultFromReq, modifyExisting } = req.body;
            const modelKey = getModeloAnalytics(modelId);
            console.log('📝 [ANALYTICS] Prompt:', prompt);
            console.log('💾 [ANALYTICS] SQL Query:', sqlQuery ? sqlQuery.substring(0, 100) + '...' : 'null');
            if (modifyExisting) console.log('🔧 [ANALYTICS] Modo: EDITAR dashboard existente');

            let data = [];
            let generatedSql = sqlQuery || "";

            // 1. SEMPRE executar a query vinculada para manter dados atualizados
            if (generatedSql) {
                console.log(`\n🔍 [Oracle] Executando query...`);
                console.log(`📄 [Oracle] SQL: ${generatedSql}`);
                
                // ========================================
                // ANÁLISE E OTIMIZAÇÃO DE QUERY
                // ========================================
                console.log('\n🔬 [Query Analyzer] Analisando query...');
                const analysis = QueryOptimizer.analyze(generatedSql);
                
                console.log(`📊 [Query Analyzer] Score: ${analysis.score}/100`);
                console.log(`🎯 [Query Analyzer] Complexidade: ${analysis.complexity}`);
                console.log(`⚠️ [Query Analyzer] Avisos: ${analysis.warnings.length}`);
                
                if (analysis.warnings.length > 0) {
                    console.log('⚠️ [Query Analyzer] Avisos:');
                    analysis.warnings.forEach(w => console.log(`   - ${w}`));
                }
                
                if (analysis.suggestions.length > 0) {
                    console.log('💡 [Query Analyzer] Sugestões:');
                    analysis.suggestions.forEach(s => console.log(`   - ${s}`));
                }
                
                // ========================================
                // VALIDAÇÃO DE SEGURANÇA
                // ========================================
                const safetyCheck = QueryOptimizer.isSafe(generatedSql);
                
                if (!safetyCheck.safe) {
                    console.error(`❌ [Oracle] QUERY BLOQUEADA: ${safetyCheck.reason}`);
                    return res.json({ 
                        success: false, 
                        isDraft: true, 
                        message: `⚠️ Query bloqueada por segurança: ${safetyCheck.reason}`,
                        generatedSql,
                        analysis: safetyCheck.analysis
                    });
                }
                
                // ========================================
                // OTIMIZAÇÃO AUTOMÁTICA
                // ========================================
                console.log('\n⚙️ [Query Optimizer] Otimizando query...');
                generatedSql = QueryOptimizer.optimize(generatedSql, {
                    autoLimit: false, // Sem limite - retorna todos os dados
                    limitRows: 5000,
                    addHints: true
                });
                generatedSql = QueryOptimizer.fixDateFormats?.(generatedSql) || generatedSql;
                
                console.log(`✅ [Query Optimizer] Query otimizada: ${generatedSql.substring(0, 100)}...`);
                
                try {
                    const connection = db.oracle ? db.oracle : db;
                    
                    // ========================================
                    // INICIA MONITORAMENTO DE PERFORMANCE
                    // ========================================
                    const queryId = crypto.randomBytes(8).toString('hex');
                    performanceMonitor.startQuery(queryId, generatedSql, {
                        user: req.user?.nome || 'desconhecido',
                        prompt: prompt || 'N/A',
                        complexity: analysis.complexity
                    });
                    
                    // ========================================
                    // EXECUÇÃO INTELIGENTE COM STREAMING/BATCH
                    // ========================================
                    console.log('\n🚀 [Query Executor] Iniciando execução inteligente...');
                    console.log(`🆔 [Query Executor] Query ID: ${queryId}`);
                    
                    const executionStart = Date.now();
                    
                    // Define timeout baseado na complexidade
                    let timeoutMs = 60000; // 1 minuto padrão
                    
                    if (analysis.complexity === 'high') {
                        timeoutMs = 180000; // 3 minutos para queries complexas
                        console.log('⏱️ [Query Executor] Query complexa detectada - timeout de 3 minutos');
                    } else if (analysis.complexity === 'medium') {
                        timeoutMs = 120000; // 2 minutos para queries médias
                        console.log('⏱️ [Query Executor] Query média detectada - timeout de 2 minutos');
                    }
                    
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error(`Query timeout: Consulta excedeu ${timeoutMs / 1000} segundos`)), timeoutMs);
                    });
                    
                    // Usa QueryStreamer para execução inteligente
                    // Ele decide automaticamente se usa batch, streaming ou execução normal
                    const queryPromise = QueryStreamer.smartExecute(connection, generatedSql, {
                        threshold: 10000, // Acima de 10k registros, usa batch
                        batchSize: 5000,
                        maxBatches: 10,   // Máximo 50k registros (10 batches de 5k)
                        onBatch: (batchData, info) => {
                            console.log(`📦 [Query Executor] Batch ${info.batchNum} processado: ${batchData.length} registros (total: ${info.totalSoFar})`);
                        }
                    });
                    
                    data = await Promise.race([queryPromise, timeoutPromise]);
                    
                    const executionTime = Date.now() - executionStart;
                    
                    // ========================================
                    // PROTEÇÃO: Limita resultado a 50000 registros
                    // ========================================
                    if (data.length > 50000) {
                        console.warn(`⚠️ [Oracle] Resultado MUITO grande (${data.length} registros), limitando a 50000`);
                        data = data.slice(0, 50000);
                    }
                    
                    const dataSize = JSON.stringify(data).length;
                    
                    console.log(`✅ [Query Executor] Execução completa em ${executionTime}ms`);
                    console.log(`📊 [Query Executor] Total de registros: ${data.length}`);
                    console.log(`💾 [Query Executor] Tamanho estimado: ${(dataSize / 1024 / 1024).toFixed(2)} MB`);
                    
                    if (data.length > 0) {
                        console.log(`🔍 [Query Executor] Primeiro registro:`, data[0]);
                        console.log(`📋 [Query Executor] Colunas:`, Object.keys(data[0]));
                    }
                    
                    // ========================================
                    // FINALIZA MONITORAMENTO DE PERFORMANCE
                    // ========================================
                    performanceMonitor.endQuery(queryId, {
                        rowCount: data.length,
                        dataSize,
                        cached: false
                    });
                    
                } catch (dbError) {
                    // ========================================
                    // REGISTRA ERRO NO MONITOR
                    // ========================================
                    if (typeof queryId !== 'undefined') {
                        performanceMonitor.errorQuery(queryId, dbError);
                    }
                    console.error('❌ [Oracle] Erro na execução:', dbError.message);
                    
                    let errorMessage = dbError.message;
                    
                    // Mensagens amigáveis para erros comuns
                    if (errorMessage.includes('timeout') || errorMessage.includes('30 segundos')) {
                        errorMessage = '⏱️ Query muito lenta (timeout 30s). Tente filtrar por período menor ou adicionar WHERE com índices.';
                    } else if (errorMessage.includes('ORA-00923')) {
                        errorMessage = 'Erro de sintaxe SQL. Verifique os nomes das colunas e tabelas.';
                    } else if (errorMessage.includes('ORA-00942')) {
                        errorMessage = 'Tabela ou view não encontrada. Verifique o nome da tabela.';
                    } else if (errorMessage.includes('ORA-00904')) {
                        errorMessage = 'Coluna inválida ou não existe. Verifique os nomes das colunas.';
                    }
                    
                    return res.json({ 
                        success: false, 
                        isDraft: true, 
                        message: `❌ Erro SQL: ${errorMessage}`, 
                        generatedSql,
                        originalError: dbError.message 
                    });
                }
            } else if (prompt) {
                const resultSql = await ai.models.generateContent({ model: modelKey, contents: `${sqlExpertContext}\nPEDIDO: "${prompt}"` });
                generatedSql = (resultSql.text || '').replace(/```sql/g, '').replace(/```/g, '').trim().replace(/;$/, '');
                return res.json({ success: false, isDraft: true, message: "Confirme a query gerada.", generatedSql });
            } else {
                return res.json({ success: false, message: 'Sem dados.' });
            }

            if (!data || data.length === 0) {
                console.log('⚠️ [Oracle] ATENÇÃO: Query não retornou dados!');
                return res.json({ success: false, message: 'Query executada mas não retornou dados. Verifique os filtros ou a query SQL.' });
            }

            // --- AUTO-DETECÇÃO DE COLUNAS ---
            const actualColumns = Object.keys(data[0]);
            let labelCol = actualColumns.find(c => typeof data[0][c] === 'string') || actualColumns[0];
            let valueCol = actualColumns.find(c => typeof data[0][c] === 'number') || actualColumns[1] || actualColumns[0];

            // --- FLUXO DE MODIFICAÇÃO: edita HTML atual com DADOS FRESCOS da query ---
            if (modifyExisting && currentHtml && typeof currentHtml === 'string' && currentHtml.length > 100) {
                try {
                    const htmlForAI = stripDataFromHtml(currentHtml, data);
                    const modPayload = {
                        acao: 'MODIFICAR',
                        htmlAtual: htmlForAI.substring(0, 120000),
                        metadata: { colunas: actualColumns, labelCol, valueCol },
                        pedidoUsuario: prompt || 'Aplique as alterações solicitadas.',
                    };
                    console.log('🤖 [AI-BI] Modificando dashboard (dados frescos da query)...');
                    const resultMod = await ai.models.generateContent({
                        model: modelKey,
                        contents: JSON.stringify(modPayload, null, 2),
                        config: {
                            systemInstruction: SYSTEM_INSTRUCTION_HTML + '\n\nMODO EDIÇÃO: Você receberá um objeto com "htmlAtual" (dashboard atual) e "pedidoUsuario". Retorne APENAS o HTML modificado, mantendo a estrutura e o placeholder {{DB_DATA}}. Não regenere do zero — altere só o necessário (ex: cores, filtros, layout).',
                            temperature: 0.2,
                            topP: 0.8,
                            topK: 40,
                            maxOutputTokens: 16384,
                        },
                    });
                    let htmlMod = (resultMod.text || '').replace(/```html/g, '').replace(/```json/g, '').replace(/```/g, '').trim();
                    const dataJson = JSON.stringify(data);
                    if (htmlMod.includes('{{DB_DATA}}')) {
                        htmlMod = htmlMod.replace(/\{\{DB_DATA\}\}/g, dataJson);
                    } else {
                        const inj = `<script>window.DB_DATA = ${dataJson};window.addEventListener('load',function(){if(typeof window.initDashboard==='function')window.initDashboard();});</script>`;
                        if (htmlMod.includes('</head>')) htmlMod = htmlMod.replace('</head>', inj + '</head>');
                        else if (htmlMod.includes('<body>')) htmlMod = htmlMod.replace('<body>', '<body>' + inj);
                        else htmlMod += inj;
                    }
                    console.log('✅ [AI-BI] Dashboard modificado com dados atualizados');
                    return res.json({ success: true, previewHtml: htmlMod, generatedSql: generatedSql, rawResult: data, metadata: { totalRecords: data.length, columns: actualColumns } });
                } catch (modErr) {
                    console.error('❌ [AI-BI] Erro na modificação:', modErr.message);
                }
            }

            // --- MODO JSON (Prompt Mestre + DataCareBI.render) ---
            if (outputFormat === 'json') {
                try {
                    const BIConfigGenerator = require('../services/BIConfigGeneratorService');
                    const userIntent = buildUserPrompt(prompt, okrContext, autoGenerateOKRs);
                    const config = await BIConfigGenerator.gerarConfig({
                        columns: actualColumns,
                        sampleData: data.slice(0, 5),
                        userIntent,
                        modelId: getModeloAnalytics(modelId)
                    });
                    console.log('✅ [AI-BI] Config JSON gerada com sucesso');
                    return res.json({
                        success: true,
                        outputFormat: 'json',
                        config,
                        rawResult: data,
                        generatedSql: generatedSql,
                        metadata: {
                            totalRecords: data.length,
                            columns: actualColumns,
                            detectedLabelColumn: labelCol,
                            detectedValueColumn: valueCol
                        }
                    });
                } catch (jsonErr) {
                    console.error('❌ [AI-BI] Erro ao gerar config JSON:', jsonErr);
                    return res.status(500).json({
                        success: false,
                        message: jsonErr.message || 'Falha ao gerar configuração JSON'
                    });
                }
            }

            console.log(`\n🤖 [AI-BI] Gerando TEMPLATE (IA) — dados injetados pelo backend ({{DB_DATA}})...`);
            console.log(`📊 [AI-BI] Colunas detectadas:`, actualColumns);
            console.log(`🏷️  [AI-BI] Label Column:`, labelCol);
            console.log(`📈 [AI-BI] Value Column:`, valueCol);

            // Separação de responsabilidades: IA gera só TEMPLATE; backend injeta dados via {{DB_DATA}}
            const userRequest = buildUserPrompt(prompt, okrContext, autoGenerateOKRs);
            const contexto = (ctxFromBody || (typeof prompt === 'string' && prompt.length < 60 ? prompt : '') || 'Censo Hospitalar em Tempo Real').trim();
            const inputPayload = {
                contexto: contexto || 'Dashboard DataCare',
                metadata: {
                    totalRegistros: data.length,
                    colunas: actualColumns,
                    labelCol,
                    valueCol,
                    exemploEstrutura: data[0] || {}
                },
                request: userRequest || 'Gere o template HTML do dashboard com placeholder {{DB_DATA}}. O backend injetará os dados.',
            };

            console.log(`⏳ [AI-BI] Aguardando resposta da IA (Gemini)...`);
            
            const resultViz = await ai.models.generateContent({
                model: modelKey,
                contents: JSON.stringify(inputPayload, null, 2),
                config: {
                    systemInstruction: SYSTEM_INSTRUCTION_HTML,
                    temperature: 0.2,
                    topP: 0.8,
                    topK: 40,
                    maxOutputTokens: 8192,
                },
            });
            
            console.log(`✅ [AI-BI] IA respondeu!`);
            
            let htmlAI = (resultViz.text || '')
                .replace(/```html/g, '')
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .trim();
            
            console.log(`📄 [AI-BI] HTML gerado: ${htmlAI.length} caracteres`);

            // Injeção de dados: replace do placeholder {{DB_DATA}} (separação de responsabilidades)
            const dataJson = JSON.stringify(data);
            if (htmlAI.includes('{{DB_DATA}}')) {
                htmlAI = htmlAI.replace(/\{\{DB_DATA\}\}/g, dataJson);
                console.log('✅ [AI-BI] Dados injetados via placeholder {{DB_DATA}}');
            } else {
                // Fallback: IA não usou placeholder — injeta script manualmente
                const dataInjectionScript = `
            <script>
                window.DB_DATA = ${dataJson};
                window.addEventListener('load', function() {
                    if (typeof window.initDashboard === 'function') window.initDashboard();
                });
            </script>
            `;
                if (htmlAI.includes('</head>')) {
                    htmlAI = htmlAI.replace('</head>', `${dataInjectionScript}</head>`);
                } else if (htmlAI.includes('<body>')) {
                    htmlAI = htmlAI.replace('<body>', `<body>${dataInjectionScript}`);
                } else {
                    htmlAI += dataInjectionScript;
                }
                console.log('⚠️ [AI-BI] Fallback: dados injetados via script (IA não usou {{DB_DATA}})');
            }

            console.log(`✅ [ANALYTICS] Respondendo ao frontend...`);
            console.log(`========================================\n`);
            
            res.json({ 
                success: true, 
                previewHtml: htmlAI, 
                generatedSql: generatedSql, 
                rawResult: data,
                metadata: {
                    totalRecords: data.length,
                    columns: actualColumns,
                    detectedLabelColumn: labelCol,
                    detectedValueColumn: valueCol
                }
            });

        } catch (error) {
            console.error('❌ [ANALYTICS] ERRO FATAL:', error.message);
            console.error('📋 [ANALYTICS] Stack:', error.stack);
            console.log(`========================================\n`);
            res.status(500).json({ success: false, message: error.message });
        }
    },

    /**
     * POST /api/analytics/layout - IA retorna APENAS JSON de config (< 1kb)
     * Usado quando temos cache de metadados para disparar em paralelo com data fetch.
     */
    layout: async (req, res) => {
        try {
            const { prompt, sqlQuery, columns, sampleData, model: modelId, okrContext, autoGenerateOKRs } = req.body;
            const biMetadataCache = require('../utils/biMetadataCache');
            let cols = columns;
            let sample = sampleData;
            if ((!cols || cols.length === 0) && sqlQuery) {
                const cached = biMetadataCache.get(sqlQuery);
                if (cached) {
                    cols = cached.columns;
                    sample = cached.sampleData;
                }
            }
            if (!cols || !Array.isArray(cols) || cols.length === 0) {
                return res.status(400).json({ success: false, message: 'columns (ou sqlQuery com cache) são obrigatórios.' });
            }
            const BIConfigGenerator = require('../services/BIConfigGeneratorService');
            const userIntent = buildUserPrompt(prompt, okrContext, autoGenerateOKRs);
            const config = await BIConfigGenerator.gerarConfig({
                columns: cols,
                sampleData: sample || [],
                userIntent,
                modelId: getModeloAnalytics(modelId)
            });
            return res.json({
                success: true,
                config,
                metadata: { columns }
            });
        } catch (err) {
            console.error('[Analytics layout]', err);
            res.status(500).json({ success: false, message: err.message });
        }
    },

    /**
     * POST /api/analytics/async-dashboard - Orquestrador Assíncrono (Promise.all)
     * Dispara Layout (IA) + Data (Oracle) em PARALELO quando há cache de metadados.
     * Caso contrário: executa query → cacheia → gera layout (sequencial).
     */
    asyncDashboard: async (req, res) => {
        const biMetadataCache = require('../utils/biMetadataCache');
        const { prompt, sqlQuery, filters, model: modelId, okrContext, autoGenerateOKRs } = req.body;
        if (!sqlQuery || !sqlQuery.trim()) {
            return res.status(400).json({ success: false, message: 'sqlQuery é obrigatório.' });
        }
        const modelKey = getModeloAnalytics(modelId);
        let generatedSql = sqlQuery.trim();
        const analysis = QueryOptimizer.analyze(generatedSql);
        if (!QueryOptimizer.isSafe(generatedSql).safe) {
            return res.status(400).json({ success: false, message: 'Query bloqueada por segurança.' });
        }
        generatedSql = QueryOptimizer.optimize(generatedSql, { autoLimit: false, limitRows: 5000, addHints: true });
        generatedSql = QueryOptimizer.fixDateFormats?.(generatedSql) || generatedSql;

        const cached = biMetadataCache.get(generatedSql);
        let biConfig;
        let data = [];
        let fromCache = false;

        const executeQuery = async () => {
            const connection = db.oracle ? db.oracle : db;
            const result = await QueryStreamer.smartExecute(connection, generatedSql, { threshold: 10000, batchSize: 5000, maxBatches: 10 });
            return Array.isArray(result) ? result : [];
        };

        const generateLayout = async (columns, sampleData, rawData) => {
            const useAutoDiscovery = req.body.useAutoDiscovery === true;
            if (useAutoDiscovery && rawData && rawData.length > 0) {
                const DataCareAutoDiscovery = require('../utils/DataCareAutoDiscovery');
                return DataCareAutoDiscovery.analyzeAndToBiConfig(rawData, {
                    title: 'Visualização Rápida',
                    subtitle: 'Descoberta automática (sem IA)'
                });
            }
            const BIConfigGenerator = require('../services/BIConfigGeneratorService');
            const userIntent = buildUserPrompt(prompt, okrContext, autoGenerateOKRs);
            return BIConfigGenerator.gerarConfig({
                columns,
                sampleData: sampleData || [],
                userIntent,
                modelId: modelKey
            });
        };

        const executeSampleQuery = async () => {
            const connection = db.oracle ? db.oracle : db;
            const isOracle = !!db.oracle;
            const baseSql = generatedSql.replace(/;$/, '').trim();
            const sampleSql = isOracle
                ? `SELECT * FROM (${baseSql}) WHERE ROWNUM <= 5`
                : `SELECT * FROM (${baseSql}) AS sub LIMIT 5`;
            try {
                const result = await connection.raw(sampleSql);
                let rows = [];
                if (result?.rows && Array.isArray(result.rows)) rows = result.rows;
                else if (Array.isArray(result?.[0])) rows = result[0];
                else if (Array.isArray(result)) rows = result;
                else if (result?.[1] && Array.isArray(result[1])) rows = result[1];
                return rows;
            } catch (e) {
                console.warn('[Analytics executeSampleQuery]', e.message);
                return [];
            }
        };

        const run = async () => {
            if (cached && cached.columns && cached.columns.length > 0) {
                fromCache = true;
                const useAD = req.body.useAutoDiscovery === true;
                if (useAD) {
                    data = await executeQuery();
                    biConfig = await generateLayout(cached.columns, cached.sampleData, data);
                } else {
                    const [layoutResult, queryResult] = await Promise.all([
                        generateLayout(cached.columns, cached.sampleData),
                        executeQuery()
                    ]);
                    biConfig = layoutResult;
                    data = queryResult;
                }
            } else {
                const useParallelFirstLoad = req.body.parallelFirstLoad !== false;
                if (useParallelFirstLoad) {
                    const [sampleResult, fullResult] = await Promise.all([
                        executeSampleQuery(),
                        executeQuery()
                    ]);
                    data = fullResult;
                    if (!data || data.length === 0) {
                        return res.json({ success: false, message: 'Query não retornou dados.' });
                    }
                    const sample = sampleResult && sampleResult.length > 0 ? sampleResult : data.slice(0, 5);
                    const actualColumns = Object.keys((sample[0] || data[0] || {}));
                    const sampleData = sample.slice(0, 5);
                    biMetadataCache.set(generatedSql, { columns: actualColumns, sampleData });
                    biConfig = await generateLayout(actualColumns, sampleData, data);
                } else {
                    data = await executeQuery();
                    if (!data || data.length === 0) {
                        return res.json({ success: false, message: 'Query não retornou dados.' });
                    }
                    const actualColumns = Object.keys(data[0]);
                    const sampleData = data.slice(0, 5);
                    biMetadataCache.set(generatedSql, { columns: actualColumns, sampleData });
                    biConfig = await generateLayout(actualColumns, sampleData, data);
                }
            }
        };

        try {
            await run();
            if (!biConfig) {
                return res.status(500).json({ success: false, message: 'Falha ao gerar layout.' });
            }
            return res.json({
                success: true,
                biConfig,
                rawResult: data,
                fromCache,
                generatedSql
            });
        } catch (err) {
            console.error('[Analytics asyncDashboard]', err);
            res.status(500).json({ success: false, message: err.message });
        }
    },

    /**
     * POST /api/analytics/stream-dashboard - Streaming de dados (NDJSON)
     * Usa oracledb.queryStream para manter memória constante. Resposta em chunks.
     */
    streamDashboard: async (req, res) => {
        const biMetadataCache = require('../utils/biMetadataCache');
        const oracleStreamService = require('../utils/oracleStreamService');
        const { prompt, sqlQuery, model: modelId, okrContext, autoGenerateOKRs } = req.body;

        if (!sqlQuery || !sqlQuery.trim()) {
            return res.status(400).json({ success: false, message: 'sqlQuery é obrigatório.' });
        }
        if (!oracleStreamService.isOracleConfigured()) {
            return res.status(503).json({ success: false, message: 'Oracle não configurado (ORACLE_USER/ORACLE_PASSWORD).' });
        }

        let generatedSql = sqlQuery.trim();
        if (!QueryOptimizer.isSafe(generatedSql).safe) {
            return res.status(400).json({ success: false, message: 'Query bloqueada por segurança.' });
        }
        generatedSql = QueryOptimizer.optimize(generatedSql, { autoLimit: false, addHints: true });
        generatedSql = QueryOptimizer.fixDateFormats?.(generatedSql) || generatedSql;

        try {
            const cached = biMetadataCache.get(generatedSql);
            let columns = cached?.columns || [];
            let sampleData = cached?.sampleData || [];

            if (!columns.length) {
                const connection = db.oracle;
                const sampleSql = `SELECT * FROM (${generatedSql.replace(/;$/, '')}) WHERE ROWNUM <= 5`;
                try {
                    const result = await connection.raw(sampleSql);
                    let rows = [];
                    if (result?.rows && Array.isArray(result.rows)) rows = result.rows;
                    else if (Array.isArray(result?.[0])) rows = result[0];
                    else if (Array.isArray(result)) rows = result;
                    else if (result?.[1] && Array.isArray(result[1])) rows = result[1]; // Knex pode retornar [data, count]
                    if (rows.length > 0) {
                        const first = rows[0];
                        columns = (typeof first === 'object' && first !== null) ? Object.keys(first) : [];
                        if (columns.length > 0) {
                            sampleData = rows.slice(0, 5);
                            biMetadataCache.set(generatedSql, { columns, sampleData });
                        }
                    }
                } catch (sampleErr) {
                    console.warn('[Analytics streamDashboard] Sample query falhou:', sampleErr.message);
                }
                if (!columns.length) {
                    try {
                        const altSql = `SELECT * FROM (${generatedSql.replace(/;$/, '')}) FETCH FIRST 5 ROWS ONLY`;
                        const altResult = await connection.raw(altSql);
                        let altRows = altResult?.rows || altResult?.[0] || (Array.isArray(altResult) ? altResult : []);
                        if (altRows.length > 0 && typeof altRows[0] === 'object') {
                            columns = Object.keys(altRows[0]);
                            sampleData = altRows.slice(0, 5);
                            biMetadataCache.set(generatedSql, { columns, sampleData });
                        }
                    } catch (altErr) {
                        console.warn('[Analytics streamDashboard] FETCH FIRST fallback falhou:', altErr.message);
                    }
                }
            }
            if (!columns.length) {
                return res.status(400).json({ success: false, message: 'Não foi possível obter colunas da query. Verifique se a query retorna dados e se o Oracle está acessível.' });
            }

            const BIConfigGenerator = require('../services/BIConfigGeneratorService');
            const userIntent = buildUserPrompt(prompt, okrContext, autoGenerateOKRs);
            const biConfig = await BIConfigGenerator.gerarConfig({
                columns,
                sampleData,
                userIntent,
                modelId: getModeloAnalytics(modelId)
            });

            await oracleStreamService.streamToResponse({
                sqlQuery: generatedSql,
                biConfig,
                columns,
                res
            });
        } catch (err) {
            console.error('[Analytics streamDashboard]', err);
            res.status(500).json({ success: false, message: err.message });
        }
    },

    /**
     * POST /api/analytics/init - Modo JSON rápido (sem HTML)
     * Executa query + IA em sequência. IA retorna apenas lógica (~2s).
     * Retorna: { queryId, biConfig, rawResult } para carregamento gradual.
     */
    init: async (req, res) => {
        try {
            const { prompt, sqlQuery, model: modelId, okrContext, autoGenerateOKRs } = req.body;
            if (!sqlQuery || !sqlQuery.trim()) {
                return res.status(400).json({ success: false, message: 'sqlQuery é obrigatório.' });
            }

            let generatedSql = sqlQuery.trim();
            const analysis = QueryOptimizer.analyze(generatedSql);
            if (!QueryOptimizer.isSafe(generatedSql).safe) {
                return res.status(400).json({ success: false, message: 'Query bloqueada por segurança.' });
            }
            generatedSql = QueryOptimizer.optimize(generatedSql, { autoLimit: false, limitRows: 5000, addHints: true });
            generatedSql = QueryOptimizer.fixDateFormats?.(generatedSql) || generatedSql;

            let data = [];
            const connection = db.oracle ? db.oracle : db;
            data = await QueryStreamer.smartExecute(connection, generatedSql, { threshold: 10000, batchSize: 5000, maxBatches: 10 });

            if (!data || data.length === 0) {
                return res.json({ success: false, message: 'Query não retornou dados.' });
            }

            const actualColumns = Object.keys(data[0]);
            const userIntent = buildUserPrompt(prompt, okrContext, autoGenerateOKRs);

            const BIConfigGenerator = require('../services/BIConfigGeneratorService');
            const biConfig = await BIConfigGenerator.gerarConfig({
                columns: actualColumns,
                sampleData: data.slice(0, 5),
                userIntent,
                modelId: getModeloAnalytics(modelId)
            });

            const queryId = crypto.randomBytes(12).toString('hex');

            return res.json({
                success: true,
                queryId,
                biConfig,
                rawResult: data,
                generatedSql
            });
        } catch (error) {
            console.error('❌ [Analytics init]', error);
            res.status(500).json({ success: false, message: error.message });
        }
    },

    /**
     * POST /api/analytics/generate-page - Merge do biConfig (JSON da IA) no template HTML fixo
     * Gemini retorna apenas JSON; o backend faz o merge em template otimizado
     */
    generatePage: async (req, res) => {
        try {
            const { biConfig, queryCode, formCode } = req.body;
            if (!biConfig) {
                return res.status(400).json({ success: false, message: 'biConfig é obrigatório.' });
            }
            const DashboardTemplate = require('../services/DashboardTemplateService');
            DashboardTemplate.render(biConfig, queryCode, formCode, res);
        } catch (error) {
            console.error('❌ [Analytics generatePage]', error);
            res.status(500).json({ success: false, message: error.message });
        }
    },

    // Salva APENAS query SQL (sem pasta, sem dashboard). Se id informado, atualiza; senão cria.
    saveQueryOnly: async (req, res) => {
        try {
            const { id: queryId, title, sqlQuery } = req.body;
            
            if (!title || !sqlQuery) {
                return res.status(400).json({ success: false, message: 'Título e SQL são obrigatórios.' });
            }
            
            function gerarSlug(texto) {
                return texto
                    .toString()
                    .toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/\s+/g, '-')
                    .replace(/[^\w\-]+/g, '')
                    .replace(/\-\-+/g, '-')
                    .replace(/^-+/, '')
                    .replace(/-+$/, '');
            }
            
            const timestamp = new Date().getTime().toString().slice(-4);
            const slug = `query-${gerarSlug(title)}-${timestamp}`;

            const hasSavedQueries = await db.schema.hasTable('saved_queries');
            
            if (hasSavedQueries) {
                if (queryId) {
                    const updated = await db('saved_queries')
                        .where('id', queryId)
                        .update({
                            title,
                            description: 'Query SQL reutilizável',
                            sql_query: sqlQuery
                        });
                    
                    if (updated === 0) {
                        return res.status(404).json({ success: false, message: 'Query não encontrada.' });
                    }
                    console.log(`[Analytics] Query "${title}" (ID: ${queryId}) atualizada.`);
                    return res.json({ success: true, id: queryId, message: 'Query atualizada com sucesso!' });
                }
                
                const [result] = await db('saved_queries')
                    .insert({
                        title,
                        description: 'Query SQL reutilizável',
                        sql_query: sqlQuery,
                        created_at: new Date()
                    })
                    .returning('id');
                
                const id = result?.id || result;
                console.log(`[Analytics] Query "${title}" salva com ID: ${id}`);
                return res.json({ success: true, id, message: 'Query salva com sucesso na biblioteca!' });
            }
            
            if (queryId) {
                const updated = await db('config_indicadores')
                    .where('id', queryId)
                    .whereNull('pasta_id')
                    .update({
                        titulo: title,
                        descricao: 'Query reutilizável',
                        slug,
                        query_sql: sqlQuery
                    });
                
                if (updated === 0) {
                    return res.status(404).json({ success: false, message: 'Query não encontrada.' });
                }
                console.log(`[Analytics] Query "${title}" (ID: ${queryId}) atualizada (config_indicadores).`);
                return res.json({ success: true, id: queryId, message: 'Query atualizada com sucesso!' });
            }
            
            const [result] = await db('config_indicadores').insert({
                titulo: title, 
                descricao: 'Query reutilizável', 
                slug,
                query_sql: sqlQuery, 
                tipo_grafico: 'query_only',
                fonte_dados: 'analytics_query',
                pasta_id: null,
                responsavel: req.user?.nome || req.user?.nm_usuario || 'Sistema',
                ativo: true,
                created_at: new Date()
            }).returning('id');
            
            const id = result?.id || result;
            console.log(`[Analytics] Query "${title}" salva com ID: ${id} (sem pasta)`);
            return res.json({ success: true, id, message: 'Query salva com sucesso!' });
        } catch (e) { 
            console.error('[Analytics] Erro ao salvar query:', e);
            res.status(500).json({ success: false, message: e.message }); 
        }
    },

    saveWidget: async (req, res) => {
        try {
            const { title, prompt, sqlQuery, htmlTemplate, biConfig, pasta_id } = req.body;
            
            const hasBiConfig = biConfig && typeof biConfig === 'object' && (biConfig.widgets?.length || biConfig.kpis?.length || biConfig.charts?.length);
            const hasHtml = htmlTemplate && String(htmlTemplate).trim() && String(htmlTemplate).trim() !== '<!-- JSON config -->';
            
            if (!title || !sqlQuery) {
                return res.status(400).json({ success: false, message: 'Informe o nome do dashboard e a query SQL.' });
            }
            
            if (!hasBiConfig && !hasHtml) {
                return res.status(400).json({ success: false, message: 'Gere um dashboard no chat antes de salvar.' });
            }
            
            if (!pasta_id) {
                return res.status(400).json({ success: false, message: 'Selecione uma pasta para salvar o dashboard.' });
            }
            
            // Gera slug único baseado no nome do indicador
            function gerarSlug(texto) {
                return texto
                    .toString()
                    .toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/\s+/g, '-')
                    .replace(/[^\w\-]+/g, '')
                    .replace(/\-\-+/g, '-')
                    .replace(/^-+/, '')
                    .replace(/-+$/, '');
            }
            
            const timestamp = new Date().getTime().toString().slice(-4);
            const slug = `${gerarSlug(title)}-${timestamp}`;

            const configuracao = {
                html_template: hasHtml ? htmlTemplate : (biConfig ? '<!-- JSON config -->' : ''),
                prompt_original: prompt,
                created_by_user: req.user?.cd_usuario || null,
                created_at_timestamp: new Date().toISOString()
            };
            if (hasBiConfig) configuracao.bi_config = biConfig;

            // Salva em config_indicadores (mesma tabela que os outros indicadores)
            const [result] = await db('config_indicadores').insert({
                titulo: title, 
                descricao: prompt || 'Dashboard gerado por IA', 
                slug: slug,
                query_sql: sqlQuery, 
                tipo_grafico: 'analytics_dashboard',
                fonte_dados: 'analytics_ia',
                pasta_id: parseInt(pasta_id, 10),
                responsavel: req.user?.nome || req.user?.nm_usuario || 'Sistema',
                ativo: true,
                configuracao,
                created_at: new Date()
            }).returning('id');
            
            const id = result?.id || result;
            
            console.log(`[Analytics] Dashboard "${title}" salvo com ID: ${id}, slug: ${slug} na pasta ${pasta_id}`);
            res.json({ 
                success: true, 
                id,
                slug,
                message: 'Dashboard salvo com sucesso e disponível na pasta selecionada!',
                redirect: `/api/analytics/view/${slug}`
            });
        } catch (e) { 
            console.error('[Analytics] Erro ao salvar widget:', e);
            res.status(500).json({ success: false, message: e.message }); 
        }
    },

    deleteQuery: async (req, res) => {
        try {
            const { id } = req.params;
            
            console.log(`[Analytics] 🗑️ Tentando excluir Query ID: ${id}`);
            
            // Verifica se existe tabela saved_queries
            const hasSavedQueries = await db.schema.hasTable('saved_queries');
            
            if (hasSavedQueries) {
                const deleted = await db('saved_queries').where('id', id).del();
                
                if (deleted === 0) {
                    return res.status(404).json({ success: false, message: 'Query não encontrada' });
                }
                
                console.log(`[Analytics] ✅ Query ID: ${id} excluída da saved_queries`);
            } else {
                // Fallback: deleta de config_indicadores
                const deleted = await db('config_indicadores')
                    .where('id', id)
                    .whereIn('tipo_grafico', ['query_only', 'analytics_query'])
                    .del();
                
                if (deleted === 0) {
                    return res.status(404).json({ success: false, message: 'Query não encontrada' });
                }
                
                console.log(`[Analytics] ✅ Query ID: ${id} excluída de config_indicadores`);
            }
            
            res.json({ 
                success: true, 
                message: 'Query excluída com sucesso!',
                id: id
            });
        } catch (e) { 
            console.error('[Analytics] ❌ Erro ao excluir query:', e);
            res.status(500).json({ success: false, message: e.message }); 
        }
    },

    deleteWidget: async (req, res) => {
        try {
            const { id } = req.params;
            
            console.log(`[Analytics] 🗑️ Tentando desativar Dashboard ID: ${id}`);
            
            // Verifica se o dashboard existe
            const widget = await db('config_indicadores')
                .where('id', id)
                .where('fonte_dados', 'analytics_ia')
                .first();
            
            if (!widget) {
                console.log(`[Analytics] ❌ Dashboard ID: ${id} não encontrado`);
                return res.status(404).json({ success: false, message: 'Dashboard não encontrado' });
            }
            
            console.log(`[Analytics] ✅ Dashboard encontrado: "${widget.titulo}"`);
            
            // Desativa o dashboard
            const updated = await db('config_indicadores')
                .where('id', id)
                .update({ 
                    ativo: false,
                    updated_at: new Date()
                });
            
            console.log(`[Analytics] ✅ Dashboard ID: ${id} desativado (${updated} linha(s) afetada(s))`);
            
            // Invalida o cache do dashboard deletado
            cacheDashboards.invalidate(id);
            
            res.json({ 
                success: true, 
                message: 'Dashboard removido com sucesso!',
                id: id
            });
        } catch (e) { 
            console.error('[Analytics] ❌ Erro ao deletar dashboard:', e);
            res.status(500).json({ success: false, message: e.message }); 
        }
    },

    // Visualizar um dashboard salvo (aceita ID numérico ou slug pelo nome)
    viewWidget: async (req, res) => {
        try {
            const { id } = req.params;
            const idOrSlug = (typeof id === 'string') ? id.trim() : String(id || '');
            
            console.log(`\n[Analytics] 📊 Carregando Dashboard: ${idOrSlug}`);
            
            const isNumericId = /^\d+$/.test(idOrSlug);
            const widget = await db('config_indicadores')
                .where(isNumericId ? 'id' : 'slug', isNumericId ? parseInt(idOrSlug, 10) : idOrSlug)
                .where('fonte_dados', 'analytics_ia')
                .first();
            
            if (!widget) {
                console.log(`[Analytics] ❌ Dashboard "${idOrSlug}" não encontrado (fonte_dados != analytics_ia)`);
                return res.status(404).send(`
                    <!DOCTYPE html>
                    <html lang="pt-BR">
                    <head>
                        <meta charset="UTF-8">
                        <title>Dashboard Não Encontrado</title>
                        <script src="https://cdn.tailwindcss.com"></script>
                        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
                    </head>
                    <body class="bg-slate-100 flex items-center justify-center min-h-screen">
                        <div class="bg-white p-8 rounded-lg shadow-xl max-w-2xl text-center">
                            <i class="fas fa-search text-6xl text-slate-300 mb-4"></i>
                            <h1 class="text-2xl font-bold text-slate-800 mb-4">Dashboard Não Encontrado</h1>
                            <p class="text-slate-600 mb-6">O dashboard "${idOrSlug}" não existe ou foi removido.</p>
                            <a href="/analytics" class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 inline-block">
                                <i class="fas fa-arrow-left mr-2"></i>Voltar para Analytics
                            </a>
                        </div>
                    </body>
                    </html>
                `);
            }
            
            const widgetId = widget.id; // ID numérico para cache e referências
            console.log(`[Analytics] ✅ Dashboard encontrado: "${widget.titulo}" (ID: ${widgetId})`);
            console.log(`[Analytics] 📝 Query SQL: ${widget.query_sql ? widget.query_sql.substring(0, 100) + '...' : 'NULL'}`);
            console.log(`[Analytics] 🎨 Configuracao: ${widget.configuracao ? 'Existe' : 'NULL'}`);

            // ========================================
            // SISTEMA DE CACHE INTELIGENTE
            // ========================================
            const forceRefresh = req.query.refresh === 'true'; // Permite forçar atualização via ?refresh=true
            let data = [];
            let fromCache = false;
            let cacheAge = 0;
            
            // Tenta buscar do cache primeiro (se não for refresh forçado)
            if (!forceRefresh) {
                const cachedData = cacheDashboards.get(widgetId);
                if (cachedData) {
                    data = cachedData;
                    fromCache = true;
                    const meta = cacheDashboards.getMetadata(widgetId);
                    cacheAge = meta ? Math.round((Date.now() - meta.timestamp) / 1000) : 0;
                    console.log(`[Analytics] 🚀 Dados carregados do CACHE (${cacheAge}s atrás, ${data.length} registros)`);
                }
            } else {
                console.log(`[Analytics] 🔄 Refresh forçado - ignorando cache`);
                cacheDashboards.invalidate(widgetId);
            }
            
            // Se não tem cache, executa a query
            if (!fromCache) {
                try {
                    const connection = db.oracle ? db.oracle : db;
                    
                    console.log(`[Analytics] ⏳ Executando query do Dashboard ID ${widgetId}...`);
                    const startTime = Date.now();
                    
                    // Validação: verifica se tem query SQL
                    if (!widget.query_sql || widget.query_sql.trim() === '') {
                        console.error('[Analytics] Dashboard sem query SQL!');
                        return res.status(500).send('<h1>Erro: Dashboard não tem query SQL configurada</h1>');
                    }
                    
                    // ========================================
                    // TIMEOUT DE 60 SEGUNDOS (aumentado para queries pesadas)
                    // ========================================
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Query timeout: Consulta excedeu 60 segundos')), 60000);
                    });
                    
                    const queryPromise = connection.raw(widget.query_sql);
                    
                    const result = await Promise.race([queryPromise, timeoutPromise]);
                    
                    const executionTime = Date.now() - startTime;
                    
                    // Oracle retorna em formatos diferentes dependendo do driver
                    if (result.rows && Array.isArray(result.rows)) {
                        data = result.rows;
                    } else if (Array.isArray(result[0])) {
                        data = result[0];
                    } else if (Array.isArray(result)) {
                        data = result;
                    } else {
                        data = [];
                    }
                    
                    // ========================================
                    // PROTEÇÃO: Limita resultado a 10000 registros
                    // ========================================
                    if (data.length > 10000) {
                        console.warn(`⚠️ [Analytics] Widget retornou ${data.length} registros, limitando a 10000`);
                        data = data.slice(0, 10000);
                    }
                    
                    // Converte strings numéricas para números
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
                    
                    console.log(`✅ [Analytics] Dashboard ID ${widgetId}: ${data.length} registros carregados em ${executionTime}ms`);
                    
                    // ========================================
                    // SALVA NO CACHE (TTL dinâmico baseado no tempo de execução)
                    // ========================================
                    let ttl = cacheDashboards.DEFAULT_TTL_MS; // 30 minutos padrão
                    
                    // Se a query demorou muito, aumenta o TTL para evitar execuções frequentes
                    if (executionTime > 10000) { // > 10 segundos
                        ttl = 60 * 60 * 1000; // 1 hora
                        console.log(`[Analytics] ⏰ Query pesada (${executionTime}ms) - TTL aumentado para 60min`);
                    } else if (executionTime > 5000) { // > 5 segundos
                        ttl = 45 * 60 * 1000; // 45 minutos
                        console.log(`[Analytics] ⏰ Query moderada (${executionTime}ms) - TTL de 45min`);
                    }
                    
                    cacheDashboards.set(widgetId, data, ttl);
                } catch (dbError) {
                console.error('❌ [Analytics] Erro ao executar query do dashboard:', dbError.message);
                
                // Retorna página de erro amigável
                return res.status(500).send(`
                    <!DOCTYPE html>
                    <html lang="pt-BR">
                    <head>
                        <meta charset="UTF-8">
                        <title>Erro ao Carregar Dashboard</title>
                        <script src="https://cdn.tailwindcss.com"></script>
                    </head>
                    <body class="bg-slate-100 flex items-center justify-center min-h-screen">
                        <div class="bg-white p-8 rounded-lg shadow-xl max-w-2xl">
                            <div class="text-center mb-6">
                                <i class="fas fa-exclamation-triangle text-6xl text-red-500"></i>
                            </div>
                            <h1 class="text-2xl font-bold text-slate-800 mb-4 text-center">Erro ao Carregar Dashboard</h1>
                            <div class="bg-red-50 border border-red-200 rounded p-4 mb-4">
                                <p class="text-red-700 text-sm"><strong>Erro:</strong> ${dbError.message}</p>
                            </div>
                            <div class="bg-blue-50 border border-blue-200 rounded p-4">
                                <p class="text-blue-700 text-sm"><strong>Dica:</strong> 
                                ${dbError.message.includes('timeout') 
                                    ? 'A consulta está demorando muito. Tente adicionar filtros de data ou limitar os resultados.' 
                                    : 'Verifique se a query SQL está correta e as tabelas existem.'}
                                </p>
                            </div>
                            <div class="text-center mt-6">
                                <a href="/analytics" class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 inline-block">
                                    Voltar para Analytics
                                </a>
                            </div>
                        </div>
                    </body>
                    </html>
                `);
                }
            }

            // Extrair config e HTML/biConfig do campo configuracao (JSONB)
            let html = '';
            let biConfig = null;
            try {
                const config = typeof widget.configuracao === 'string' 
                    ? JSON.parse(widget.configuracao) 
                    : widget.configuracao;
                html = config?.html_template || '';
                biConfig = config?.bi_config || null;
                
                const isJsonPlaceholder = !html || String(html).trim() === '<!-- JSON config -->';
                let effectiveBiConfig = biConfig;
                if (isJsonPlaceholder && !effectiveBiConfig && data && data.length > 0) {
                    const DataCareAutoDiscovery = require('../utils/DataCareAutoDiscovery');
                    effectiveBiConfig = DataCareAutoDiscovery.analyzeAndToBiConfig(data, {
                        title: widget.titulo || 'Dashboard',
                        subtitle: 'Visualização gerada automaticamente'
                    });
                    if (effectiveBiConfig) console.log('[Analytics] Fallback: biConfig gerado via Auto-Discovery (dashboard salvo antes da migração)');
                }
                if (isJsonPlaceholder && !effectiveBiConfig) {
                    console.error('[Analytics] Dashboard sem bi_config nem template válido e sem dados para Auto-Discovery');
                    return res.status(500).send('<h1>Erro: Configuração do dashboard inválida</h1>');
                }
                
                // Se temos bi_config (ou gerado por Auto-Discovery), montar HTML que usa DataCareBI.render
                if (effectiveBiConfig && isJsonPlaceholder) {
                    const safeTitle = (widget.titulo || 'Dashboard').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
                    const biConfigJson = JSON.stringify(effectiveBiConfig).replace(/<\//g, '<\\/');
                    html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script src="/js/DataCareBI-bundle.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
<style>body{font-family:'Inter',sans-serif;background:#f8fafc}#dashboard-container{min-height:400px}</style>
</head>
<body class="p-6">
<div id="dashboard-container"></div>
<script type="application/json" id="bi-config-json">${biConfigJson}</script>
<script>
window.initDashboard=function(){var c=document.getElementById('bi-config-json');var b=c?JSON.parse(c.textContent):null;
if(typeof DataCareBI!=='undefined'&&window.DB_DATA!==undefined&&b){DataCareBI.render(b,window.DB_DATA,'dashboard-container');}};
</script>
</body></html>`;
                }
            } catch (e) {
                console.error('[Analytics] Erro ao parsear configuração:', e);
                return res.status(500).send('<h1>Erro ao carregar dashboard</h1>');
            }

            // Injetar dados atualizados no HTML (ANTES de qualquer script)
            const dataInjectionScript = `
            <script>
                // ============================================
                // DADOS INJETADOS PELO BACKEND (DataCare BI)
                // ============================================
                window.DB_DATA = ${JSON.stringify(data)};
                window.dadosOriginais = ${JSON.stringify(data)};
                window.CACHE_INFO = {
                    fromCache: ${fromCache},
                    cacheAge: ${cacheAge},
                    recordCount: ${data.length},
                    dashboardId: ${widgetId}
                };
                
                console.log('✅ [DataCare BI] Widget "${widget.titulo}" carregado');
                console.log('📊 [DataCare BI] Registros:', window.DB_DATA.length);
                console.log('💾 [DataCare BI] Cache:', window.CACHE_INFO.fromCache ? 'Dados do cache (' + window.CACHE_INFO.cacheAge + 's)' : 'Dados atualizados');
                console.log('🔍 [DataCare BI] Primeiro registro:', window.DB_DATA[0]);
                console.log('📋 [DataCare BI] Colunas:', Object.keys(window.DB_DATA[0] || {}));
                
                // Força re-execução de initDashboard se existir
                window.addEventListener('load', function() {
                    console.log('🔄 [DataCare BI] Window loaded - verificando initDashboard...');
                    
                    // Aguarda um pouco para garantir que todos os scripts foram carregados
                    setTimeout(function() {
                        if (typeof window.initDashboard === 'function') {
                            console.log('🎯 [DataCare BI] Executando initDashboard()...');
                            window.initDashboard();
                        } else {
                            console.warn('⚠️ [DataCare BI] initDashboard() não encontrado');
                        }
                        
                        // Dispara DOMContentLoaded manualmente se necessário
                        const event = new Event('DOMContentLoaded');
                        document.dispatchEvent(event);
                    }, 500);
                });
            </script>
            `;

            // ========================================
            // BOTÃO DE REFRESH E INDICADOR DE CACHE
            // ========================================
            const refreshButton = `
            <style>
                #datacare-refresh-btn {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 9999;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 12px 20px;
                    border-radius: 12px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 14px;
                    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                #datacare-refresh-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
                }
                #datacare-refresh-btn:active {
                    transform: translateY(0);
                }
                #datacare-refresh-btn.loading {
                    opacity: 0.7;
                    cursor: wait;
                }
                #datacare-cache-badge {
                    position: fixed;
                    top: 70px;
                    right: 20px;
                    z-index: 9998;
                    background: rgba(255, 255, 255, 0.95);
                    border: 1px solid #e2e8f0;
                    padding: 8px 14px;
                    border-radius: 8px;
                    font-size: 12px;
                    color: #64748b;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    display: ${fromCache ? 'flex' : 'none'};
                    align-items: center;
                    gap: 6px;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .spinning {
                    animation: spin 1s linear infinite;
                }
            </style>
            <button id="datacare-refresh-btn" onclick="refreshDashboard()">
                <i class="fas fa-sync-alt" id="refresh-icon"></i>
                <span>Atualizar Dados</span>
            </button>
            <div id="datacare-cache-badge">
                <i class="fas fa-clock" style="color: #f59e0b;"></i>
                <span>Dados em cache (${Math.floor(cacheAge / 60)}min atrás)</span>
            </div>
            <script>
                function refreshDashboard() {
                    const btn = document.getElementById('datacare-refresh-btn');
                    const icon = document.getElementById('refresh-icon');
                    
                    btn.classList.add('loading');
                    icon.classList.add('spinning');
                    btn.disabled = true;
                    
                    // Recarrega a página com parâmetro refresh=true
                    const url = new URL(window.location.href);
                    url.searchParams.set('refresh', 'true');
                    window.location.href = url.toString();
                }
            </script>
            `;
            
            // Injeta dados APÓS <head> (antes de qualquer outro script)
            if (html.includes('</head>')) {
                html = html.replace('</head>', `${dataInjectionScript}</head>`);
            } else if (html.includes('<body>')) {
                html = html.replace('<body>', `<body>${dataInjectionScript}`);
            } else {
                html = dataInjectionScript + html;
            }
            
            // Injeta botão de refresh APÓS <body>
            if (html.includes('<body>')) {
                html = html.replace('<body>', `<body>${refreshButton}`);
            } else if (html.includes('</head>')) {
                html = html.replace('</head>', `</head>${refreshButton}`);
            } else {
                html = refreshButton + html;
            }

            console.log(`[Analytics] ✅ Retornando HTML completo (${html.length} caracteres)`);
            
            // IMPORTANTE: Define headers para página completa (não iframe)
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // Permite iframe apenas do mesmo domínio
            
            res.send(html);
        } catch (error) {
            console.error('[Analytics] Erro ao visualizar widget:', error);
            res.status(500).render('pages/500', { 
                title: 'Erro ao Carregar Dashboard',
                error, 
                user: req.user 
            });
        }
    },

    // Listagem de todos os dashboards
    listaDashboards: async (req, res) => {
        try {
            const dashboards = await db('config_indicadores')
                .where('config_indicadores.ativo', true)  // ✅ Especifica a tabela
                .where('config_indicadores.fonte_dados', 'analytics_ia')
                .leftJoin('indicadores_pastas as p', 'config_indicadores.pasta_id', 'p.id')
                .orderBy('config_indicadores.created_at', 'desc')
                .select(
                    'config_indicadores.id',
                    'config_indicadores.titulo',
                    'config_indicadores.slug',
                    'config_indicadores.descricao',
                    'config_indicadores.created_at',
                    'config_indicadores.pasta_id',
                    'p.nome as pasta_nome',
                    'p.cor_hex as pasta_cor',
                    'p.icone as pasta_icone'
                );
            
            console.log(`[Analytics] 📊 ${dashboards.length} dashboards encontrados`);
            
            res.render('pages/analytics/lista', { 
                title: 'Meus Dashboards IA', 
                user: req.user, 
                dashboards,
                hideFooter: true
            });
        } catch (error) {
            console.error('[Analytics] Erro ao listar dashboards:', error);
            res.status(500).render('pages/500', { 
                title: 'Erro no Servidor',
                error, 
                user: req.user 
            });
        }
    },

    // Templates pré-definidos
    getTemplates: async (req, res) => {
        const templates = [
            {
                id: 'kpi-cards',
                nome: 'Dashboard de KPIs',
                descricao: 'Cards com indicadores principais e totalizadores',
                icone: 'fa-chart-bar',
                exemplo: 'Total de pacientes, Média de atendimento, Taxa de ocupação',
                prompt: 'Crie um dashboard com 4 cards de KPIs principais no topo, mostrando: Total Geral, Média, Valor Máximo e Valor Mínimo. Use cores diferentes para cada card (azul, verde, roxo, laranja). Adicione um gráfico de barras abaixo.'
            },
            {
                id: 'temporal-trend',
                nome: 'Análise Temporal',
                descricao: 'Gráficos de linha para tendências ao longo do tempo',
                icone: 'fa-chart-line',
                exemplo: 'Evolução mensal, Série histórica, Comparativos',
                prompt: 'Crie um dashboard com análise temporal. Mostre 3 KPIs principais no topo. Adicione um gráfico de linha grande mostrando a evolução ao longo do tempo. Inclua também um gráfico de área para visualizar volumes acumulados.'
            },
            {
                id: 'categorical-comparison',
                nome: 'Comparação por Categoria',
                descricao: 'Gráficos de barras e pizza para comparações',
                icone: 'fa-chart-pie',
                exemplo: 'Distribuição por setor, Top 10, Ranking',
                prompt: 'Crie um dashboard comparativo com 3 KPIs no topo. Adicione um gráfico de barras horizontais mostrando o ranking das categorias. Inclua um gráfico de pizza/donut mostrando a distribuição percentual. Use cores distintas.'
            },
            {
                id: 'executive-summary',
                nome: 'Resumo Executivo',
                descricao: 'Dashboard completo com múltiplas visualizações',
                icone: 'fa-layer-group',
                exemplo: 'Visão gerencial, Dashboard consolidado, Multi-análise',
                prompt: 'Crie um dashboard executivo completo com: 6 KPIs principais no topo (2 linhas), um gráfico de linha para tendência temporal, um gráfico de barras para comparação, e um gráfico de pizza para distribuição. Use um layout profissional com cores da identidade DataCare.'
            },
            {
                id: 'operational-detail',
                nome: 'Detalhamento Operacional',
                descricao: 'Dashboard com tabelas e detalhes granulares',
                icone: 'fa-table',
                exemplo: 'Listagens, Detalhes, Drill-down',
                prompt: 'Crie um dashboard operacional com 4 KPIs no topo. Adicione um gráfico de barras para visão geral. Inclua uma tabela HTML responsiva mostrando os primeiros 20 registros com todas as colunas disponíveis. Use scroll horizontal se necessário.'
            },
            {
                id: 'performance-metrics',
                nome: 'Métricas de Performance',
                descricao: 'Indicadores de desempenho com metas e alertas',
                icone: 'fa-tachometer-alt',
                exemplo: 'SLA, Metas, Indicadores de performance',
                prompt: 'Crie um dashboard de performance com 4 KPIs destacados mostrando valores e percentuais. Use cores de alerta (verde para bom, amarelo para atenção, vermelho para crítico). Adicione gráficos de linha mostrando evolução e um gráfico de barras com comparação de metas.'
            }
        ];

        res.json({ success: true, templates });
    },

    // Aplicar template
    applyTemplate: async (req, res) => {
        try {
            const { templateId, sqlQuery } = req.body;
            
            const templates = {
                'kpi-cards': 'Crie um dashboard com 4 cards de KPIs principais no topo, mostrando: Total Geral, Média, Valor Máximo e Valor Mínimo. Use cores diferentes para cada card (azul, verde, roxo, laranja). Adicione um gráfico de barras abaixo.',
                'temporal-trend': 'Crie um dashboard com análise temporal. Mostre 3 KPIs principais no topo. Adicione um gráfico de linha grande mostrando a evolução ao longo do tempo. Inclua também um gráfico de área para visualizar volumes acumulados.',
                'categorical-comparison': 'Crie um dashboard comparativo com 3 KPIs no topo. Adicione um gráfico de barras horizontais mostrando o ranking das categorias. Inclua um gráfico de pizza/donut mostrando a distribuição percentual. Use cores distintas.',
                'executive-summary': 'Crie um dashboard executivo completo com: 6 KPIs principais no topo (2 linhas), um gráfico de linha para tendência temporal, um gráfico de barras para comparação, e um gráfico de pizza para distribuição. Use um layout profissional com cores da identidade DataCare.',
                'operational-detail': 'Crie um dashboard operacional com 4 KPIs no topo. Adicione um gráfico de barras para visão geral. Inclua uma tabela HTML responsiva mostrando os primeiros 20 registros com todas as colunas disponíveis. Use scroll horizontal se necessário.',
                'performance-metrics': 'Crie um dashboard de performance com 4 KPIs destacados mostrando valores e percentuais. Use cores de alerta (verde para bom, amarelo para atenção, vermelho para crítico). Adicione gráficos de linha mostrando evolução e um gráfico de barras com comparação de metas.'
            };

            const prompt = templates[templateId];
            if (!prompt) {
                return res.status(400).json({ success: false, message: 'Template não encontrado' });
            }

            // Redireciona para o preview com o prompt e contexto do template
            req.body.prompt = prompt;
            req.body.contexto = templateId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            return analyticsController.preview(req, res);

        } catch (error) {
            console.error('[Analytics] Erro ao aplicar template:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    },

    // Exportar dashboard para PDF (placeholder para futuro)
    exportDashboard: async (req, res) => {
        try {
            const { id } = req.params;
            // TODO: Implementar exportação com Puppeteer
            res.json({ success: false, message: 'Funcionalidade em desenvolvimento' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
};

module.exports = analyticsController;