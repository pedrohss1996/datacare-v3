/**
 * DashboardQueryHelper - Helper para substituir requestQuery do AppMed
 * Faz requisições para o backend DataCare e retorna dados no formato esperado
 */

/**
 * Substitui a função requestQuery do AppMed
 * @param {string} queryId - ID da query salva ou hash da query
 * @param {Object} params - Parâmetros dinâmicos (INICIO, FINAL, etc)
 * @param {Function} successCallback - Callback de sucesso (data)
 * @param {Function} errorCallback - Callback de erro (error)
 */
async function requestQuery(queryId, params, successCallback, errorCallback) {
  try {
    const response = await fetch(`/api/analytics/data/${queryId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params || {})
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Erro ao buscar dados' }));
      if (errorCallback) errorCallback(error);
      return;
    }

    const data = await response.json();
    
    // Se retornou sucesso com dados
    if (data.success && data.data) {
      if (successCallback) successCallback(data.data);
    } else if (data.success && Array.isArray(data)) {
      // Se retornou array direto
      if (successCallback) successCallback(data);
    } else {
      // Formato inesperado
      if (errorCallback) errorCallback({ message: 'Formato de dados inválido' });
    }
  } catch (error) {
    console.error('Erro ao buscar dados:', error);
    if (errorCallback) errorCallback(error);
  }
}

/**
 * Versão Promise (alternativa moderna)
 * @param {string} queryId - ID da query
 * @param {Object} params - Parâmetros
 * @returns {Promise<Array>} Dados da query
 */
async function fetchDashboardData(queryId, params = {}) {
  const response = await fetch(`/api/analytics/data/${queryId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    throw new Error(`Erro ${response.status}: ${response.statusText}`);
  }

  const result = await response.json();
  
  // Normaliza retorno
  if (result.success && result.data) return result.data;
  if (Array.isArray(result)) return result;
  if (result.data && Array.isArray(result.data)) return result.data;
  
  throw new Error('Formato de dados inválido');
}

/**
 * Helper para formatar datas para query Oracle
 * @param {string|Date} date - Data
 * @returns {string} Data formatada (YYYY-MM-DD HH24:MI:SS)
 */
function formatDateForOracle(date) {
  if (!date) return null;
  
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  
  const pad = (n) => n.toString().padStart(2, '0');
  
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Helper para calcular período (últimas X horas)
 * @param {number} hours - Número de horas
 * @returns {Object} { INICIO, FINAL }
 */
function calculatePeriod(hours) {
  const now = new Date();
  const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
  
  return {
    INICIO: formatDateForOracle(start),
    FINAL: formatDateForOracle(now)
  };
}

// Exporta para uso global (compatibilidade com código gerado)
if (typeof window !== 'undefined') {
  window.requestQuery = requestQuery;
  window.fetchDashboardData = fetchDashboardData;
  window.formatDateForOracle = formatDateForOracle;
  window.calculatePeriod = calculatePeriod;
}

module.exports = {
  requestQuery,
  fetchDashboardData,
  formatDateForOracle,
  calculatePeriod
};
