# 🎨 Guia: Dashboards Profissionais para SaaS

## 📐 1. DESIGN SYSTEM CONSISTENTE

### Paleta de Cores (Hospitalar/SaaS)
```javascript
// Cores Semânticas
const CORES = {
  // Primárias
  primary: '#4f46e5',      // Indigo-600 (confiança)
  secondary: '#6366f1',    // Indigo-500
  
  // Semânticas
  success: '#10b981',      // Emerald-500
  warning: '#f59e0b',      // Amber-500
  danger: '#ef4444',       // Red-500
  info: '#3b82f6',         // Blue-500
  
  // Neutras
  slate: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a'
  }
};
```

### Tipografia
- **Fonte Principal**: Inter (Google Fonts) - Clean, moderna, legível
- **Hierarquia**:
  - H1: `text-3xl font-bold` (Títulos principais)
  - H2: `text-2xl font-semibold` (Seções)
  - H3: `text-xl font-medium` (Subseções)
  - Body: `text-sm` (Conteúdo)
  - Caption: `text-xs` (Labels, metadados)

### Espaçamento Padrão
```css
/* Grid System */
.container { max-width: 1600px; margin: 0 auto; padding: 1.5rem; }
.grid-gap { gap: 1.5rem; } /* 24px entre cards */

/* Cards */
.card-padding { padding: 1.5rem; } /* 24px interno */
.card-radius { border-radius: 0.75rem; } /* 12px */
.card-shadow { box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
.card-shadow-hover { box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
```

---

## 📊 2. ESTRUTURA DE LAYOUT (HIERARQUIA VISUAL)

### Layout Padrão SaaS (Z-Pattern)
```
┌─────────────────────────────────────────────────┐
│  HEADER (Título + Filtros)                       │
├─────────────────────────────────────────────────┤
│  KPIs (4 cards em linha)                         │
├─────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  Chart 1     │  │  Tabela Detalhamento    │ │
│  │  (Doughnut)  │  │  (Scroll + Paginação)   │ │
│  └──────────────┘  └──────────────────────────┘ │
│  ┌──────────────┐                               │
│  │  Chart 2     │                               │
│  │  (Bar/Line)  │                               │
│  └──────────────┘                               │
└─────────────────────────────────────────────────┘
```

### Regra dos 4 KPIs
**SEMPRE** comece com 4 KPIs principais:
1. **Métrica Principal** (Total, Soma, Contagem)
2. **Métrica Secundária** (Média, Percentual)
3. **Tendência** (Variação, Crescimento)
4. **Status** (Pico, Crítico, Alerta)

---

## 🎯 3. CARDS DE KPI (PADRÃO PROFISSIONAL)

### Estrutura do Card
```html
<div class="bg-white rounded-xl p-6 shadow-sm border border-slate-200 hover:shadow-lg transition-all">
  <!-- Header -->
  <div class="flex items-center justify-between mb-3">
    <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">
      Título do KPI
    </span>
    <div class="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
      <i class="fa-solid fa-chart-line text-indigo-600"></i>
    </div>
  </div>
  
  <!-- Valor Principal -->
  <div class="mb-2">
    <span class="text-3xl font-bold text-slate-900">1.234</span>
    <span class="text-sm text-slate-500 ml-2">unidades</span>
  </div>
  
  <!-- Indicador de Tendência -->
  <div class="flex items-center gap-2 text-sm">
    <span class="flex items-center text-emerald-600">
      <i class="fa-solid fa-arrow-up mr-1"></i>
      +12.5%
    </span>
    <span class="text-slate-400">vs. mês anterior</span>
  </div>
</div>
```

### Cores por Intenção
- **POSITIVE** (Sucesso): `from-emerald-500 to-teal-600`
- **NEGATIVE** (Alerta): `from-rose-500 to-red-600`
- **NEUTRAL** (Info): `from-slate-500 to-slate-600`
- **INFO** (Destaque): `from-blue-500 to-indigo-600`

---

## 📈 4. GRÁFICOS (CHART.JS - CONFIGURAÇÃO PROFISSIONAL)

### Configuração Base (Reutilizável)
```javascript
const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      labels: {
        padding: 15,
        font: { size: 12, family: 'Inter' },
        usePointStyle: true
      }
    },
    tooltip: {
      backgroundColor: '#1e293b',
      padding: 12,
      titleFont: { size: 14, weight: '600' },
      bodyFont: { size: 13 },
      borderColor: '#334155',
      borderWidth: 1,
      cornerRadius: 8,
      displayColors: true,
      callbacks: {
        label: function(context) {
          return `${context.dataset.label}: ${formatValue(context.parsed.y)}`;
        }
      }
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: {
        borderDash: [4, 4],
        color: '#f1f5f9',
        drawBorder: false
      },
      ticks: {
        font: { size: 11 },
        color: '#64748b',
        callback: function(value) {
          return formatValue(value);
        }
      }
    },
    x: {
      grid: { display: false },
      ticks: {
        font: { size: 11 },
        color: '#64748b'
      }
    }
  }
};
```

### Tipos de Gráfico por Contexto
- **Bar (Barras)**: Comparação entre categorias
- **Line (Linha)**: Tendências temporais
- **Doughnut (Rosca)**: Distribuições percentuais (máx 6 fatias)
- **Pie**: Evitar (use Doughnut)
- **Area**: Tendências acumuladas

---

## 🎨 5. ANIMAÇÕES E TRANSIÇÕES

### Loading States
```css
/* Skeleton Loading */
.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
}

@keyframes loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

### Transições Suaves
```css
.card {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 20px -5px rgba(0, 0, 0, 0.1);
}
```

---

## 🔍 6. FILTROS E INTERATIVIDADE

### Barra de Filtros (Sempre no Topo)
```html
<div class="bg-white rounded-xl p-4 border border-slate-200 mb-6">
  <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
    <!-- Date Range -->
    <div>
      <label class="block text-xs font-semibold text-slate-600 mb-1">Período</label>
      <input type="date" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
    </div>
    
    <!-- Select (Categoria) -->
    <div>
      <label class="block text-xs font-semibold text-slate-600 mb-1">Setor</label>
      <select class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
        <option>Todos</option>
      </select>
    </div>
    
    <!-- Botão Aplicar -->
    <div class="flex items-end">
      <button class="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium">
        <i class="fa-solid fa-filter mr-2"></i>Filtrar
      </button>
    </div>
  </div>
</div>
```

### Drill-Down (Clique no Gráfico)
```javascript
// Sempre adicione onClick nos gráficos
options: {
  onClick: (event, elements) => {
    if (elements.length > 0) {
      const index = elements[0].index;
      const label = chart.data.labels[index];
      // Abre modal com detalhes ou filtra tabela
      showDetailModal(label);
    }
  }
}
```

---

## 📱 7. RESPONSIVIDADE (MOBILE-FIRST)

### Breakpoints Tailwind
```css
/* Mobile: 1 coluna */
.grid { grid-template-columns: 1fr; }

/* Tablet: 2 colunas */
@media (min-width: 768px) {
  .grid { grid-template-columns: repeat(2, 1fr); }
}

/* Desktop: 4 colunas */
@media (min-width: 1024px) {
  .grid { grid-template-columns: repeat(4, 1fr); }
}
```

### KPIs Responsivos
- Mobile: 1 coluna (stack vertical)
- Tablet: 2 colunas
- Desktop: 4 colunas

---

## ⚡ 8. PERFORMANCE (CRÍTICO PARA SaaS)

### Lazy Loading de Dados
```javascript
// Carrega dados em batches
async function loadDashboardData(queryId, page = 1, limit = 100) {
  const response = await fetch(`/api/analytics/data/${queryId}?page=${page}&limit=${limit}`);
  return response.json();
}
```

### Virtual Scrolling (Tabelas Grandes)
```javascript
// Use biblioteca como react-window ou implemente virtual scroll
// Máximo 100 linhas visíveis por vez
```

### Cache de Queries
```javascript
// Cache no Redis (5 minutos)
const cacheKey = `dashboard:${queryId}:${filtersHash}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);
```

---

## 🎯 9. PADRÕES DE VISUALIZAÇÃO (ESCOLHA INTELIGENTE)

### Quando Usar Cada Tipo

| Tipo | Quando Usar | Exemplo |
|------|-------------|---------|
| **Bar** | Comparar categorias | Faturamento por Setor |
| **Line** | Tendência temporal | Evolução Mensal |
| **Doughnut** | Distribuição % | Participação por Convênio |
| **KPI Card** | Métrica única | Total de Atendimentos |
| **Tabela** | Detalhamento | Lista de Pacientes |

### Regra de Ouro
- **Máximo 4 KPIs** por dashboard
- **Máximo 2 gráficos** principais
- **1 tabela** de detalhamento
- **Máximo 6 fatias** em Doughnut

---

## 🔐 10. SEGURANÇA E PRIVACIDADE

### Sanitização de Dados
```javascript
// Sempre sanitize dados antes de exibir
function sanitizeValue(value) {
  if (typeof value === 'string') {
    return value.replace(/[<>]/g, ''); // Remove HTML
  }
  return value;
}
```

### Limite de Dados
```javascript
// Nunca retorne mais de 10.000 registros
const MAX_ROWS = 10000;
if (data.length > MAX_ROWS) {
  data = data.slice(0, MAX_ROWS);
  showWarning('Mostrando primeiros 10.000 registros');
}
```

---

## 📋 11. CHECKLIST DE QUALIDADE

### Antes de Publicar um Dashboard

- [ ] **Design**
  - [ ] Paleta de cores consistente
  - [ ] Tipografia legível (Inter)
  - [ ] Espaçamento uniforme
  - [ ] Ícones FontAwesome (v6)

- [ ] **Funcionalidade**
  - [ ] Filtros funcionando
  - [ ] Gráficos interativos (tooltip, click)
  - [ ] Tabela paginada
  - [ ] Loading states

- [ ] **Performance**
  - [ ] Carrega em < 3s
  - [ ] Cache implementado
  - [ ] Lazy loading (se > 1000 rows)

- [ ] **Responsividade**
  - [ ] Mobile (1 coluna)
  - [ ] Tablet (2 colunas)
  - [ ] Desktop (4 colunas)

- [ ] **Acessibilidade**
  - [ ] Contraste de cores adequado
  - [ ] Labels descritivos
  - [ ] Alt text em ícones

---

## 🚀 12. TEMPLATE BASE (COPIE E ADAPTE)

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Dashboard - DataCare</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
  <style>
    body { font-family: 'Inter', sans-serif; background: #f8fafc; }
    .card { background: white; border-radius: 0.75rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card:hover { box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
  </style>
</head>
<body class="p-6">
  <div class="max-w-[1600px] mx-auto">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-3xl font-bold text-slate-900">Título do Dashboard</h1>
      <p class="text-sm text-slate-500 mt-1">Descrição ou contexto</p>
    </div>
    
    <!-- Filtros -->
    <div class="card mb-6">
      <!-- Filtros aqui -->
    </div>
    
    <!-- KPIs -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
      <!-- 4 KPI Cards -->
    </div>
    
    <!-- Gráficos + Tabela -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-1">
        <!-- Gráficos -->
      </div>
      <div class="lg:col-span-2">
        <!-- Tabela -->
      </div>
    </div>
  </div>
  
  <script>
    // Seu código JavaScript aqui
    window.DB_DATA = []; // Dados injetados pelo backend
  </script>
</body>
</html>
```

---

## 💡 DICAS FINAIS

1. **Menos é Mais**: Dashboard limpo > Dashboard cheio
2. **Hierarquia Visual**: O mais importante deve chamar atenção primeiro
3. **Consistência**: Use o mesmo padrão em todos os dashboards
4. **Performance**: Cache tudo que puder
5. **Mobile**: Sempre teste no celular
6. **Acessibilidade**: Contraste mínimo 4.5:1
7. **Loading**: Sempre mostre feedback visual
8. **Erros**: Trate graciosamente (mensagens claras)

---

**Resultado**: Dashboards que parecem feitos por uma equipe de design profissional, mesmo gerados por IA! 🎨✨
