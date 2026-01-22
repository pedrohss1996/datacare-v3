// ARQUIVO: src/controllers/AnalyticsController.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const db = require('../infra/database/connection'); 

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
//const model = genAI.getGenerativeModel({ model: 'gemini-pro-latest' });
const sqlExpertContext = `
    Você é um DBA Oracle Sênior.
    REGRAS:
    1. Datas: TRUNC(SYSDATE) ou TO_CHAR(data, 'HH24').
    2. Group By: Obrigatório para colunas não agregadas.
    3. Limite: FETCH FIRST 200 ROWS ONLY.
    4. SAÍDA: Apenas SQL puro.
`;

/**
 * CONTEXTO BI: "REAL-TIME CALCULATION MODE + INTERATIVIDADE"
 * Obriga a IA a escrever scripts que calculam os números, proibindo valores estáticos.
 * Inclui suporte para filtros, drill-down e interações avançadas.
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
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
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
    - Use Chart.js v4+ syntax
    - Cores do DataCare: blue-600 (primária), green-600, purple-600, orange-600
    - Grid responsivo: mobile-first
    - Sombras suaves: shadow-lg
    - Animações: transition-all duration-300
    - Font Awesome 6.4.0 para ícones
    
    SAÍDA:
    Retorne APENAS o código HTML completo (incluindo <!DOCTYPE html>).
    Não adicione explicações, apenas o código pronto para uso.
`;

const analyticsController = {

    index: async (req, res) => {
        try {
            let savedWidgets = [];
            try { 
                // Usando a tabela sis_indicadores existente
                savedWidgets = await db('sis_indicadores')
                    .where('ativo', true)
                    .orderBy('id', 'desc')
                    .select('id', 'titulo as title', 'descricao as description', 'consulta_sql as oracle_sql_query', 'tipo_grafico', 'created_at');
            } catch (e) {
                console.error('[Analytics] Erro ao carregar widgets:', e);
            }
            res.render('pages/analytics/index', { 
                title: 'Analytics Builder - IA', 
                user: req.user, 
                savedWidgets,
                hideFooter: true  // Esconde o footer
            });
        } catch (error) {
            console.error(error);
            res.status(500).render('pages/500', { error });
        }
    },

    preview: async (req, res) => {
        console.log('\n========================================');
        console.log('📥 [ANALYTICS PREVIEW] Request recebido');
        console.log('========================================');
        
        try {
            let { prompt, sqlQuery } = req.body;
            console.log('📝 [ANALYTICS] Prompt:', prompt);
            console.log('💾 [ANALYTICS] SQL Query:', sqlQuery ? sqlQuery.substring(0, 100) + '...' : 'null');
            
            let data = [];
            let generatedSql = sqlQuery || "";

            // 1. Executar SQL
            if (generatedSql) {
                console.log(`\n🔍 [Oracle] Executando query...`);
                console.log(`📄 [Oracle] SQL: ${generatedSql}`);
                try {
                    const connection = db.oracle ? db.oracle : db;
                    const result = await connection.raw(generatedSql);
                    
                    // Oracle retorna em formatos diferentes dependendo do driver
                    // Tenta múltiplos formatos
                    if (result.rows && Array.isArray(result.rows)) {
                        data = result.rows; // Formato oracledb driver
                    } else if (Array.isArray(result[0])) {
                        data = result[0]; // Formato Knex com Oracle
                    } else if (Array.isArray(result)) {
                        data = result; // Formato direto ✅ ESTE É O NOSSO CASO
                    } else {
                        console.error('[Oracle] Formato desconhecido:', result);
                        data = [];
                    }
                    
                    // Converte strings numéricas para números (fetchAsString do Oracle)
                    data = data.map(row => {
                        const newRow = {};
                        for (const [key, value] of Object.entries(row)) {
                            // Se é string numérica, converte para número
                            if (typeof value === 'string' && !isNaN(value) && value.trim() !== '') {
                                newRow[key] = parseFloat(value);
                            } else {
                                newRow[key] = value;
                            }
                        }
                        return newRow;
                    });
                    
                    console.log(`✅ [Oracle] Retornou ${data.length} registros`);
                    console.log(`📊 [Oracle] Primeiro registro:`, data[0]);
                    console.log(`📋 [Oracle] Colunas:`, Object.keys(data[0] || {}));
                    
                } catch (dbError) {
                    console.error('❌ [Oracle] Erro na execução:', dbError.message);
                    return res.json({ success: false, isDraft: true, message: `Erro SQL: ${dbError.message}`, generatedSql });
                }
            } else if (prompt) {
                const resultSql = await model.generateContent(`${sqlExpertContext}\nPEDIDO: "${prompt}"`);
                generatedSql = resultSql.response.text().replace(/```sql/g, '').replace(/```/g, '').trim().replace(/;$/, '');
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

            console.log(`\n🤖 [AI-BI] Gerando Dashboard com IA...`);
            console.log(`📊 [AI-BI] Colunas detectadas:`, actualColumns);
            console.log(`🏷️  [AI-BI] Label Column:`, labelCol);
            console.log(`📈 [AI-BI] Value Column:`, valueCol);

            // Prompt Reforçado para Cálculo com Análise de Dados
            const promptAI = `
                ${biExpertContext}
                
                ================== ANÁLISE DOS DADOS ==================
                Total de Registros: ${data.length}
                Colunas Disponíveis: ${JSON.stringify(actualColumns)}
                
                Tipos de Dados Detectados:
                ${actualColumns.map(col => {
                    const sampleValue = data[0][col];
                    const type = typeof sampleValue;
                    return `  - ${col}: ${type} (exemplo: ${sampleValue})`;
                }).join('\n')}
                
                Coluna Sugerida para LABELS (Eixo X / Categorias): ${labelCol}
                Coluna Sugerida para VALORES (Eixo Y / Métricas): ${valueCol}
                
                ================== PEDIDO DO USUÁRIO ==================
                "${prompt || 'Crie um dashboard completo com KPIs, gráficos e insights'}"
                
                ================== INSTRUÇÕES ESPECÍFICAS ==================
                1. Analise os dados e identifique:
                   - Se há dados temporais (datas, meses, anos)
                   - Se há categorias (setores, produtos, tipos)
                   - Se há valores numéricos para soma/média
                
                2. Crie KPIs relevantes:
                   - Total geral (soma de ${valueCol})
                   - Média
                   - Máximo e Mínimo
                   - Contagem de registros
                
                3. Escolha os gráficos adequados:
                   - Se temporal → Gráfico de Linha ou Área
                   - Se categórico → Gráfico de Barras
                   - Se percentual/distribuição → Pizza ou Donut
                   - Sempre mostre pelo menos 2 gráficos diferentes
                
                4. CÓDIGO EXEMPLO OBRIGATÓRIO que você DEVE usar DENTRO de initDashboard():
                
                   // DENTRO da função window.initDashboard:
                   const dados = window.DB_DATA;
                   console.log('Processando', dados.length, 'registros');
                   
                   // KPI 1: Total
                   const total = dados.reduce((acc, item) => acc + (Number(item.${valueCol}) || 0), 0);
                   const elemTotal = document.getElementById('kpi-total');
                   if (elemTotal) {
                       elemTotal.textContent = total.toLocaleString('pt-BR');
                       console.log('✅ KPI Total atualizado:', total);
                   } else {
                       console.error('❌ Elemento kpi-total não encontrado!');
                   }
                   
                   // KPI 2: Média
                   const media = total / dados.length;
                   const elemMedia = document.getElementById('kpi-media');
                   if (elemMedia) {
                       elemMedia.textContent = media.toLocaleString('pt-BR', {minimumFractionDigits: 2});
                       console.log('✅ KPI Média atualizado:', media);
                   }
                   
                   // Repita para todos os KPIs!
                
                CRÍTICO: 
                - TODO código JavaScript DEVE estar DENTRO de window.initDashboard = function() { ... }
                - SEMPRE use getElementById e verifique if (elemento) antes de atribuir
                - SEMPRE adicione console.log para debug
                - NUNCA escreva valores hardcoded no HTML (use "Carregando..." como placeholder)
            `;

            console.log(`⏳ [AI-BI] Aguardando resposta da IA (Gemini)...`);
            
            const resultViz = await model.generateContent(promptAI);
            
            console.log(`✅ [AI-BI] IA respondeu!`);
            
            let htmlAI = resultViz.response.text()
                .replace(/```html/g, '')
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .trim();
            
            console.log(`📄 [AI-BI] HTML gerado: ${htmlAI.length} caracteres`);

            // Injeta os dados E força execução do DOMContentLoaded
            const dataInjectionScript = `
            <script>
                // ============================================
                // DADOS INJETADOS PELO BACKEND (DataCare BI)
                // ============================================
                window.DB_DATA = ${JSON.stringify(data)};
                console.log('✅ [DataCare BI] Dados injetados:', window.DB_DATA.length, 'registros');
                console.log('📊 [DataCare BI] Colunas:', Object.keys(window.DB_DATA[0] || {}));
                console.log('🔍 [DataCare BI] Primeiro registro:', window.DB_DATA[0]);
                
                // FORÇA EXECUÇÃO IMEDIATA após injetar no iframe
                window.addEventListener('load', function() {
                    console.log('🔄 [DataCare BI] Window loaded - forçando renderização...');
                    if (typeof window.initDashboard === 'function') {
                        window.initDashboard();
                    }
                    // Dispara evento DOMContentLoaded manualmente se necessário
                    const event = new Event('DOMContentLoaded');
                    document.dispatchEvent(event);
                });
            </script>
            `;

            // Insere o script LOGO APÓS o <head>
            if (htmlAI.includes('</head>')) {
                htmlAI = htmlAI.replace('</head>', `${dataInjectionScript}</head>`);
            } else if (htmlAI.includes('<body>')) {
                htmlAI = htmlAI.replace('<body>', `<body>${dataInjectionScript}`);
            } else {
                htmlAI += dataInjectionScript;
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

    saveWidget: async (req, res) => {
        try {
            const { title, prompt, sqlQuery, htmlTemplate } = req.body;
            
            if (!title || !sqlQuery || !htmlTemplate) {
                return res.status(400).json({ success: false, message: 'Dados incompletos.' });
            }

            // Salvando na tabela sis_indicadores existente
            const [id] = await db('sis_indicadores').insert({
                titulo: title, 
                descricao: prompt || 'Dashboard gerado por IA', 
                consulta_sql: sqlQuery, 
                tipo_grafico: 'mixed', // mixed = múltiplos gráficos
                configuracao: JSON.stringify({ html_template: htmlTemplate }),
                grupo_modulo: 'Analytics IA',
                ativo: true,
                created_at: new Date(),
                updated_at: new Date()
            }).returning('id');
            
            console.log(`[Analytics] Widget "${title}" salvo com ID: ${id}`);
            res.json({ success: true, id, message: 'Dashboard salvo com sucesso!' });
        } catch (e) { 
            console.error('[Analytics] Erro ao salvar widget:', e);
            res.status(500).json({ success: false, message: e.message }); 
        }
    },

    deleteWidget: async (req, res) => {
        try {
            const { id } = req.params;
            
            console.log(`[Analytics] 🗑️ Tentando desativar Widget ID: ${id}`);
            
            // Verifica se o widget existe
            const widget = await db('sis_indicadores').where('id', id).first();
            
            if (!widget) {
                console.log(`[Analytics] ❌ Widget ID: ${id} não encontrado`);
                return res.status(404).json({ success: false, message: 'Dashboard não encontrado' });
            }
            
            console.log(`[Analytics] ✅ Widget encontrado: "${widget.titulo}"`);
            
            // Desativa o widget
            const updated = await db('sis_indicadores')
                .where('id', id)
                .update({ 
                    ativo: false,
                    updated_at: new Date()
                });
            
            console.log(`[Analytics] ✅ Widget ID: ${id} desativado (${updated} linha(s) afetada(s))`);
            
            res.json({ 
                success: true, 
                message: 'Dashboard removido com sucesso!',
                id: id
            });
        } catch (e) { 
            console.error('[Analytics] ❌ Erro ao deletar widget:', e);
            res.status(500).json({ success: false, message: e.message }); 
        }
    },

    // Visualizar um widget salvo
    viewWidget: async (req, res) => {
        try {
            const { id } = req.params;
            const widget = await db('sis_indicadores').where('id', id).first();
            
            if (!widget) {
                return res.status(404).render('pages/404', { title: 'Dashboard não encontrado' });
            }

            // Executar a query novamente para dados atualizados
            let data = [];
            try {
                const connection = db.oracle ? db.oracle : db;
                const result = await connection.raw(widget.consulta_sql);
                
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
                
                console.log(`[Analytics] Widget ID ${id}: ${data.length} registros carregados`);
            } catch (dbError) {
                console.error('[Analytics] Erro ao executar query do widget:', dbError);
            }

            // Extrair HTML template da configuração JSON
            let html = '';
            try {
                const config = typeof widget.configuracao === 'string' 
                    ? JSON.parse(widget.configuracao) 
                    : widget.configuracao;
                html = config.html_template || '';
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
                
                console.log('✅ [DataCare BI] Widget "${widget.titulo}" carregado');
                console.log('📊 [DataCare BI] Registros:', window.DB_DATA.length);
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

            // Injeta LOGO APÓS <head> (antes de qualquer outro script)
            if (html.includes('</head>')) {
                html = html.replace('</head>', `${dataInjectionScript}</head>`);
            } else if (html.includes('<body>')) {
                html = html.replace('<body>', `<body>${dataInjectionScript}`);
            } else {
                html = dataInjectionScript + html;
            }

            res.send(html);
        } catch (error) {
            console.error('[Analytics] Erro ao visualizar widget:', error);
            res.status(500).render('pages/500', { error });
        }
    },

    // Listagem de todos os dashboards
    listaDashboards: async (req, res) => {
        try {
            const dashboards = await db('sis_indicadores')
                .where('ativo', true)  // Apenas dashboards ativos
                .orderBy('created_at', 'desc')
                .select('*');
            
            res.render('pages/analytics/lista', { 
                title: 'Meus Dashboards', 
                user: req.user, 
                dashboards,
                hideFooter: true  // Esconde o footer
            });
        } catch (error) {
            console.error('[Analytics] Erro ao listar dashboards:', error);
            res.status(500).render('pages/500', { error });
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

            // Redireciona para o preview com o prompt do template
            req.body.prompt = prompt;
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