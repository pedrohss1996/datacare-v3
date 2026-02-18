/**
 * BIConfigGeneratorService - DataCare BI Logic Engine
 * Gera APENAS JSON de configuração (sem HTML). ~2s vs ~30s do HTML.
 * Usa @google/genai (SDK oficial 2024+).
 */
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/** System instruction: persona do Desenvolvedor Sênior Fullstack DataCare */
const SYSTEM_INSTRUCTION = 'Você é um Desenvolvedor Sênior Fullstack com vasta experiência hospitalar. Seu objetivo é gerar interfaces e estruturas de dados para o SaaS DataCare. Use sempre Tailwind CSS, Chart.js e ícones do FontAwesome. Foque em soluções super escaláveis, profissionais e com estética "Clean Hospitalar". Responda sempre em português.';

/** Configuração de geração para respostas consistentes */
const GENERATION_CONFIG = {
  temperature: 0.2,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: 'text/plain',
};

/**
 * PROMPT DE ANÁLISE DE CAMPOS - Etapa 1
 * A IA deve analisar os dados ANTES de criar indicadores.
 * Retorna significado, tipo e sugestão de visualização por coluna.
 */
const PROMPT_ANALISE_CAMPOS = `Você é um analista de dados hospitalares. Analise as colunas e amostra da consulta SQL.

COMO FAZER:
1. Para cada coluna, interprete o nome (ex: DT_ENTRADA, VL_CONTA, NM_PACIENTE) e os valores da amostra.
2. Defina: significado (o que representa), tipo (data|numero|texto|id), e sugestao (como usar no dashboard).

SAÍDA: Retorne APENAS um JSON array, sem explicações:
[
  { "field": "NOME_COLUNA", "significado": "descrição clara", "tipo": "data|numero|texto|id", "sugestao": "kpi_avg|kpi_sum|kpi_count|eixo_temporal|eixo_categoria|eixo_valor|proporcao" }
]

Colunas: [COLUNAS]
Amostra (top 5): [AMOSTRA]`;

/**
 * PROMPT UNIVERSAL DE BI - DataCare Global BI Architect
 * Template fixo baseado no layout hospitalar de referência (4 KPIs + 2 charts).
 * A IA DEVE seguir EXATAMENTE este schema para garantir dashboards profissionais.
 */
const PROMPT_BI_LOGIC = `# ROLE: DataCare Global BI Architect
# OBJETIVO: Gerar dashboards hospitalares com layout PADRÃO DataCare (referência visual obrigatória).

# CONTEXTO - Análise dos campos da consulta:
[ANALISE]

# LAYOUT OBRIGATÓRIO (copie este template e adapte os nomes das colunas)

## ESTRUTURA FIXA - 4 KPIs + 2 Charts + Tabela

1) **PRIMEIRA LINHA - 4 cards KPI** (sempre nesta ordem e formato):

   | # | label | field | op | icon | format |
   |---|-------|-------|----|------|--------|
   | 1 | Total de Atendimentos | coluna_principal (ex: NM_PACIENTE ou ID) | count | fa-users | number |
   | 2 | Setor Crítico (Pico) | DS_SETOR ou NM_SETOR | moda | fa-map-marker-alt | - |
   | 3 | Convênio Majoritário | DS_CONVENIO ou CONVENIO | moda | fa-first-aid | - |
   | 4 | % de Particulares | DS_CONVENIO (para identificar "Particular") | percent_particular | fa-dollar-sign | percent |

   - "moda" = valor mais frequente na coluna.
   - "percent_particular" = porcentagem de registros onde DS_CONVENIO contém "Particular" (case-insensitive).
   - Use os nomes EXATOS das colunas que existem na análise. Se não houver setor, use a coluna mais próxima (ex: DS_SETOR, NM_SETOR, SETOR). Se não houver convênio, use DS_CONVENIO, CONVENIO.

2) **SEGUNDA LINHA - 2 gráficos** (sempre neste formato):

   a) **Distribuição por Setor** - Doughnut
      - xAxis: coluna de setor (DS_SETOR, NM_SETOR, SETOR)
      - yAxis: coluna para contagem (ex: NM_PACIENTE ou a chave primária)
      - op: count
      - title: "Distribuição por Setor"
      - hint: "Clique em uma fatia para filtrar o detalhamento"

   b) **Volume por Convênio** - Bar VERTICAL
      - xAxis: coluna de convênio (DS_CONVENIO, CONVENIO)
      - yAxis: coluna para contagem
      - op: count
      - title: "Volume por Convênio"
      - indexAxis: não definir (gráfico de barras vertical)
      - hint: "Gráfico interativo com seleção de dados"

3) **Tabela**: colunas principais para detalhamento (NM_PACIENTE, DS_CONVENIO, DS_SETOR, VL_CONTA, DT_ENTRADA, etc).

# OUTPUT - Retorne APENAS este JSON (sem explicações):

{
  "layout": "grid-cols-4",
  "header": { "title": "Dashboard", "subtitle": "" },
  "filters": [
    { "field": "DT_ENTRADA", "label": "Período", "type": "dateRange" },
    { "field": "DS_CONVENIO", "label": "Convênio", "type": "select" }
  ],
  "widgets": [
    { "type": "kpi", "id": "total", "label": "Total de Atendimentos", "field": "NM_PACIENTE", "op": "count", "icon": "fa-users", "action": "Ver Detalhes", "detailField": "NM_PACIENTE" },
    { "type": "kpi", "id": "setor_pico", "label": "Setor Crítico (Pico)", "field": "DS_SETOR", "op": "moda", "icon": "fa-map-marker-alt", "action": "Ver Detalhes", "detailField": "DS_SETOR" },
    { "type": "kpi", "id": "convenio_majoritario", "label": "Convênio Majoritário", "field": "DS_CONVENIO", "op": "moda", "icon": "fa-first-aid", "action": "Ver Detalhes", "detailField": "DS_CONVENIO" },
    { "type": "kpi", "id": "pct_particular", "label": "% de Particulares", "field": "DS_CONVENIO", "op": "percent_particular", "icon": "fa-dollar-sign", "format": "percent", "action": "Ver Detalhes", "detailField": "DS_CONVENIO" },
    { "type": "chart", "id": "chart1", "style": "doughnut", "title": "Distribuição por Setor", "xAxis": "DS_SETOR", "yAxis": "NM_PACIENTE", "op": "count", "action": "Filtrar Detalhamento", "detailField": "DS_SETOR", "hint": "Clique em uma fatia para filtrar o detalhamento" },
    { "type": "chart", "id": "chart2", "style": "bar", "title": "Volume por Convênio", "xAxis": "DS_CONVENIO", "yAxis": "NM_PACIENTE", "op": "count", "action": "Filtrar Detalhamento", "detailField": "DS_CONVENIO", "hint": "Gráfico interativo com seleção de dados", "indexAxis": null },
    { "type": "table", "columns": ["NM_PACIENTE","DS_CONVENIO","DS_SETOR","VL_CONTA","DT_ENTRADA"], "limit": 20 }
  ]
}

# REGRAS:
- **Substitua** os nomes das colunas (NM_PACIENTE, DS_SETOR, DS_CONVENIO, etc) pelos nomes EXATOS que existem na análise acima.
- **filters**: Use colunas de data (DT_*) para dateRange e colunas de categoria para select.
- **KPIs com moda e percent_particular**: O sistema entende esses ops. Não use avg/sum para Setor Crítico ou Convênio Majoritário.
- **Bar chart**: Sempre vertical (indexAxis não deve ser "y"). Use style: "bar".
- **Doughnut**: Máximo 6 fatias visíveis; as maiores por volume.
- **Todo widget** deve ter action e detailField para Click-to-Filter.

# INTENÇÃO DO USUÁRIO: [INTENCAO]`;

/**
 * Etapa 1: Analisa os campos da consulta para entender significado, tipo e sugestão de visualização.
 * Obrigatório ANTES de gerar indicadores.
 */
async function analisarCampos({ columns, sampleData, modelId = 'gemini-3-flash-preview' }) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada.');

  const sample = Array.isArray(sampleData) ? sampleData.slice(0, 5) : [];
  const prompt = PROMPT_ANALISE_CAMPOS
    .replace('[COLUNAS]', JSON.stringify(columns || []))
    .replace('[AMOSTRA]', JSON.stringify(sample));

  const result = await ai.models.generateContent({
    model: modelId,
    contents: prompt,
    config: { systemInstruction: SYSTEM_INSTRUCTION, ...GENERATION_CONFIG },
  });
  let text = (result.text || '').trim();
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const analise = JSON.parse(text);
    return Array.isArray(analise) ? analise : [];
  } catch (e) {
    return [];
  }
}

/**
 * Gera config JSON (apenas lógica, sem HTML).
 * Fluxo: 1) Analisa campos (IA) → 2) Gera indicadores com base na análise.
 */
async function gerarConfig({ columns, sampleData, userIntent, modelId = 'gemini-3-flash-preview', skipAnalise = false }) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada.');

  let analise = [];
  if (!skipAnalise && columns?.length > 0) {
    analise = await analisarCampos({ columns, sampleData, modelId });
  }
  const analiseTexto = analise.length > 0
    ? JSON.stringify(analise, null, 2)
    : `Colunas: ${JSON.stringify(columns || [])}. Amostra: ${JSON.stringify((sampleData || []).slice(0, 5))}.`;

  const prompt = PROMPT_BI_LOGIC
    .replace('[ANALISE]', analiseTexto)
    .replace('[INTENCAO]', userIntent || 'Dashboard completo com KPIs e gráficos.');

  const result = await ai.models.generateContent({
    model: modelId,
    contents: prompt,
    config: { systemInstruction: SYSTEM_INSTRUCTION, ...GENERATION_CONFIG },
  });
  let text = (result.text || '').trim();
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  let config;
  try {
    config = JSON.parse(text);
  } catch (e) {
    throw new Error(`IA não retornou JSON válido: ${e.message}`);
  }

  config.layout = config.layout || 'grid';
  config.header = config.header || { title: 'Dashboard', subtitle: '' };
  config.widgets = normalizarWidgetsUX(config.widgets || []);
  config = ensureFiltersAndTable(config, columns);

  return config;
}

/**
 * Dicionário de colunas hospitalares (Tasy/DataCare) -> Label legível.
 * Baseado em convenções de nomenclatura e contexto de negócio.
 */
const COLUNA_ALIAS = {
  NM_PACIENTE: 'Paciente',
  NM_PESSOA_FISICA: 'Nome',
  DS_CONVENIO: 'Convênio',
  CONVENIO: 'Convênio',
  VL_CONTA: 'Valor da Conta',
  VL_TOTAL: 'Valor Total',
  VALOR: 'Valor',
  DIAS_INTERNACAO: 'Dias de Internação',
  DIAS_PERMANENCIA: 'Dias de Permanência',
  DIAS_DESDE_ALTA: 'Dias desde Alta',
  DT_ENTRADA: 'Data de Entrada',
  DT_ALTA: 'Data de Alta',
  DT_AGENDA: 'Data da Agenda',
  DT_NASCIMENTO: 'Data de Nascimento',
  DT_ATUALIZACAO: 'Data de Atualização',
  DT_AGENDAMENTO: 'Data do Agendamento',
  DS_STATUS_AGENDA: 'Status',
  STATUS_DESC: 'Status',
  AUDITORIA_LIBERADA: 'Auditoria Liberada',
  FATURADO: 'Faturado',
  QTD_CONTAS: 'Qtd. de Contas',
  NR_INTERNO: 'Nº Interno',
  CD_CONVENIO: 'Cód. Convênio',
  DS_AGENDA: 'Agenda',
  HR_AGENDA: 'Hora',
  DS_EVOLUCAO: 'Evolução',
  NM_USUARIO: 'Usuário',
  DS_ENDERECO: 'Endereço',
  DS_BAIRRO: 'Bairro',
  DS_MUNICIPIO: 'Município',
  SG_ESTADO: 'UF',
  NR_ENDERECO: 'Nº',
  DS_COMPLEMENTO: 'Complemento',
  DS_EMAIL: 'E-mail'
};

const COLUNA_PREFIXOS = { DS_: 'Descrição', NM_: 'Nome', NO_: 'Nome', CD_: 'Cód.', VL_: 'Valor', DT_: 'Data', NR_: 'Nº', QTD_: 'Qtd.', QT_: 'Qtd.' };

const COLUNA_SUFIXOS = {
  PACIENTE: 'Paciente', CONVENIO: 'Convênio', CONTA: 'Conta', ENTRADA: 'Entrada', ALTA: 'Alta',
  AGENDA: 'Agenda', NASCIMENTO: 'Nascimento', STATUS: 'Status', VALOR: 'Valor', INTERNACAO: 'Internação',
  PERMANENCIA: 'Permanência', ATENDIMENTO: 'Atendimento', EVOLUCAO: 'Evolução', USUARIO: 'Usuário',
  ENDERECO: 'Endereço', MUNICIPIO: 'Município', SETOR: 'Setor', TIPO: 'Tipo', GLOSA: 'Glosa'
};

function colunaParaLabel(col) {
  if (!col) return '';
  const c = String(col).toUpperCase().trim();
  if (COLUNA_ALIAS[c]) return COLUNA_ALIAS[c];
  const prefixKey = Object.keys(COLUNA_PREFIXOS).find(p => c.startsWith(p));
  const resto = prefixKey ? c.slice(prefixKey.length) : c;
  const sufixKey = Object.keys(COLUNA_SUFIXOS).find(s => resto.endsWith(s) || resto.includes('_' + s));
  if (prefixKey && sufixKey) return COLUNA_PREFIXOS[prefixKey] + COLUNA_SUFIXOS[sufixKey];
  if (sufixKey) return COLUNA_SUFIXOS[sufixKey];
  if (prefixKey) return COLUNA_PREFIXOS[prefixKey] + resto.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).trim();
  return c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Garante que toda página de indicadores tenha filters e table (detalhamento).
 * Se a IA não retornar, deriva das colunas. Colunas de data -> dateRange (inicial/final).
 */
function ensureFiltersAndTable(config, columns) {
  const cols = columns || [];
  const catPattern = /^(DS_|NM_|NO_|CD_|TP_|ST_|STATUS|SETOR|TIPO|CONVENIO|UNIDADE)/i;
  const datePattern = /^(DT_|DATA_|DATE_)/i;

  if (!config.filters || config.filters.length === 0) {
    const filterCols = cols.filter(c => (catPattern.test(c) || datePattern.test(c)) && !/ID$|_ID$/i.test(c));
    config.filters = filterCols.slice(0, 4).map(c => {
      const isDate = datePattern.test(c);
      return {
        field: c,
        label: isDate ? 'Período' : colunaParaLabel(c),
        type: isDate ? 'dateRange' : 'select'
      };
    });
  }
  config.filters = (config.filters || []).map(f => {
    if (!f.type) f.type = datePattern.test(f.field) ? 'dateRange' : 'select';
    if (!f.label && f.field) f.label = datePattern.test(f.field) ? 'Período' : colunaParaLabel(f.field);
    return f;
  });

  const hasTable = (config.widgets || []).some(w => w.type === 'table');
  if (!hasTable && cols.length > 0) {
    const tableCols = cols.slice(0, 8);
    config.widgets = [...(config.widgets || []), { type: 'table', columns: tableCols, limit: 20 }];
  }

  return config;
}

/**
 * Normaliza widgets do schema UX (JSON Minimalista) para o schema interno:
 * - style "area" -> chartType "line"
 * - xAxis/yAxis -> label/value
 * - op -> calc
 */
function normalizarWidgetsUX(widgets) {
  const kpis = widgets.filter(w => w.type === 'kpi').slice(0, 4);
  const charts = widgets.filter(w => w.type === 'chart').slice(0, 2);
  const tables = widgets.filter(w => w.type === 'table');

  const mapFormat = (f, op) => {
    const x = (f || '').toUpperCase();
    if (x === 'BRL') return 'currency';
    if (x === 'INT') return 'number';
    if (x === 'DAYS') return 'days';
    if (x === 'NUMBER') return 'number';
    if (x === 'PERCENT') return 'percent';
    if ((op || '').toString().toLowerCase() === 'percent_particular') return 'percent';
    return (f || 'number').toLowerCase();
  };

  const validCalc = (op) => {
    const o = (op || '').toString().toLowerCase();
    if (['moda', 'percent_particular', 'count', 'sum', 'avg', 'distinct'].includes(o)) return o;
    return o || 'sum';
  };

  return [
    ...kpis.map(k => ({
      ...k,
      label: k.label || colunaParaLabel(k.field),
      calc: validCalc(k.op || k.calc),
      format: mapFormat(k.format, k.op || k.calc),
      intent: (k.intent || 'NEUTRAL').toUpperCase(),
      icon: (k.icon && String(k.icon).startsWith('fa-')) ? k.icon : undefined,
      action: k.action || 'Ver Detalhes',
      detailField: k.detailField || k.field,
    })),
    ...charts.map((c, i) => {
      const style = (c.style || c.chartType || 'bar').toLowerCase();
      const chartType = style === 'area' ? 'line' : style === 'doughnut' ? 'doughnut' : 'bar';
      const verticalBar = c.indexAxis === null || c.indexAxis === undefined || c.vertical === true;
      return {
        ...c,
        id: c.id || `chart${i + 1}`,
        chartType,
        style: style === 'area' ? 'area' : c.style,
        label: c.label || c.xAxis,
        value: c.value || c.yAxis,
        xAxis: c.xAxis || c.label,
        yAxis: c.yAxis || c.value,
        title: c.title || (c.xAxis && c.yAxis ? colunaParaLabel(c.yAxis) + ' por ' + colunaParaLabel(c.xAxis) : (c.label || '')),
        limit: c.limit || 10,
        action: c.action || 'Ver Detalhes',
        detailField: c.detailField || c.xAxis || c.label,
        hint: c.hint || (chartType === 'doughnut' ? 'Clique em uma fatia para filtrar o detalhamento' : 'Gráfico interativo com seleção de dados'),
        verticalBar: chartType === 'bar' ? verticalBar : undefined,
      };
    }),
    ...tables.map(t => {
      const cols = t.columns || [];
      const columnLabels = cols.reduce((acc, c) => {
        const key = typeof c === 'string' ? c : (c.field || c.label || c);
        if (key) acc[key] = colunaParaLabel(key);
        return acc;
      }, {});
      return { ...t, columnLabels };
    }),
  ];
}

/**
 * Normaliza config legacy (header/kpis/charts/table) para widgets
 */
function normalizarParaWidgets(config) {
  if (config.widgets && config.widgets.length > 0) return config;
  const widgets = [];
  (config.kpis || []).forEach(k => widgets.push({
    type: 'kpi', label: k.label, calc: (k.op || 'sum').toLowerCase(), field: k.field, format: k.format
  }));
  (config.charts || []).forEach((c, i) => widgets.push({
    type: 'chart', chartType: c.type || 'bar', label: c.x, value: c.y, title: c.title, id: c.id || `chart${i + 1}`
  }));
  if (config.table?.show && config.table.columns?.length) {
    widgets.push({ type: 'table', columns: config.table.columns });
  }
  return { layout: 'grid', header: config.header, widgets };
}

module.exports = { gerarConfig, analisarCampos, normalizarParaWidgets, PROMPT_BI_LOGIC };
