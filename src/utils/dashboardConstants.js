/**
 * DashboardConstants - Configurações Padrão para Dashboards Profissionais
 * Use estas constantes para garantir consistência visual em todo o SaaS
 */

module.exports = {
  // ============================================
  // CORES (Paleta Hospitalar/SaaS)
  // ============================================
  COLORS: {
    primary: '#4f46e5',      // Indigo-600
    secondary: '#6366f1',    // Indigo-500
    success: '#10b981',      // Emerald-500
    warning: '#f59e0b',       // Amber-500
    danger: '#ef4444',       // Red-500
    info: '#3b82f6',         // Blue-500
    
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
    },
    
    // Gradientes por intenção
    gradients: {
      positive: 'from-emerald-500 to-teal-600',
      negative: 'from-rose-500 to-red-600',
      neutral: 'from-slate-500 to-slate-600',
      info: 'from-blue-500 to-indigo-600',
      warning: 'from-amber-500 to-orange-500'
    }
  },

  // ============================================
  // TIPOGRAFIA
  // ============================================
  TYPOGRAPHY: {
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
    sizes: {
      h1: 'text-3xl font-bold',
      h2: 'text-2xl font-semibold',
      h3: 'text-xl font-medium',
      body: 'text-sm',
      caption: 'text-xs'
    }
  },

  // ============================================
  // ESPAÇAMENTO
  // ============================================
  SPACING: {
    container: 'max-w-[1600px] mx-auto p-6',
    cardPadding: 'p-6',
    cardGap: 'gap-6',
    sectionGap: 'mb-6'
  },

  // ============================================
  // ÍCONES POR TIPO DE KPI
  // ============================================
  KPI_ICONS: [
    'fa-chart-line',      // 0 - Tendência
    'fa-users',           // 1 - Pessoas
    'fa-clock',           // 2 - Tempo
    'fa-percent',         // 3 - Percentual
    'fa-coins',           // 4 - Financeiro
    'fa-hospital',        // 5 - Hospitalar
    'fa-calendar',        // 6 - Datas
    'fa-chart-bar'        // 7 - Gráfico
  ],

  // ============================================
  // CONFIGURAÇÃO CHART.JS (Padrão)
  // ============================================
  CHART_CONFIG: {
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
        displayColors: true
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
          color: '#64748b'
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
  },

  // ============================================
  // LIMITES E VALIDAÇÕES
  // ============================================
  LIMITS: {
    maxKPIs: 4,
    maxCharts: 2,
    maxDoughnutSlices: 6,
    maxTableRows: 10000,
    defaultPageSize: 20
  },

  // ============================================
  // FORMATADORES DE VALORES
  // ============================================
  FORMATTERS: {
    currency: (value) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(value);
    },
    
    number: (value) => {
      return new Intl.NumberFormat('pt-BR').format(value);
    },
    
    percent: (value) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      }).format(value / 100);
    },
    
    date: (value) => {
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(new Date(value));
    },
    
    datetime: (value) => {
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(value));
    }
  },

  // ============================================
  // LAYOUTS PRÉ-DEFINIDOS
  // ============================================
  LAYOUTS: {
    standard: {
      kpis: 4,
      charts: 2,
      table: true,
      grid: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
    },
    
    compact: {
      kpis: 2,
      charts: 1,
      table: false,
      grid: 'grid-cols-1 md:grid-cols-2'
    },
    
    full: {
      kpis: 6,
      charts: 3,
      table: true,
      grid: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'
    }
  }
};
