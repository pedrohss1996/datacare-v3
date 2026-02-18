/**
 * DataCareRenderer - Motor de Renderização Assíncrona (estilo Power BI/Metabase)
 * Fluxo: Skeleton (< 50ms) → Layout (IA 1-3s) → Data Fetch (< 1s) → Hydration (< 100ms)
 *
 * A IA atua como Motor de Metadados e Semântica - separação total entre Estrutura e Dados.
 */
(function () {
  'use strict';

  const API_BASE = '/api/analytics';

  /** Carrega DataCareBI.js dinamicamente se não estiver disponível */
  function ensureDataCareBI() {
    return new Promise((resolve, reject) => {
      if (typeof window.DataCareBI !== 'undefined') {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = '/js/DataCareBI.js';
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Não foi possível carregar DataCareBI.js. Verifique se o arquivo existe em /js/DataCareBI.js'));
      document.head.appendChild(script);
    });
  }

  /**
   * Mostra Skeleton UI premium imediatamente (< 50ms)
   */
  function showSkeleton(containerId) {
    const cid = containerId || 'dashboard-container';
    const container = document.getElementById(cid);
    if (!container) return;

    container.innerHTML = `
      <div class="p-6 overflow-y-auto animate-pulse">
        <div class="h-8 bg-slate-200 rounded w-1/3 mb-6"></div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="h-28 bg-slate-200 rounded-xl"></div>
          <div class="h-28 bg-slate-200 rounded-xl"></div>
          <div class="h-28 bg-slate-200 rounded-xl"></div>
          <div class="h-28 bg-slate-200 rounded-xl"></div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div class="h-72 bg-slate-200 rounded-xl"></div>
          <div class="h-72 bg-slate-200 rounded-xl"></div>
        </div>
        <div class="h-64 bg-slate-200 rounded-xl"></div>
      </div>
    `;
  }

  /**
   * Inicializa dashboard com fluxo assíncrono completo.
   * @param {Object} options - { userPrompt, sqlQuery, queryId?, filters?, model?, okrContext?, autoGenerateOKRs? }
   * @param {string} containerId - ID do container
   */
  async function initDashboard(options, containerId) {
    const cid = containerId || 'dashboard-container';
    const { userPrompt, prompt, sqlQuery, queryId, filters = {}, model, okrContext, autoGenerateOKRs, useAutoDiscovery, useStream } = options || {};
    const effectivePrompt = userPrompt || prompt;

    // Passo 1: Skeleton na tela imediatamente
    showSkeleton(cid);

    try {
      // Usa endpoint async que executa Layout + Data em paralelo quando há cache
      const payload = {
        prompt: effectivePrompt,
        sqlQuery: sqlQuery,
        queryId,
        filters,
        model: model || 'gemini-2.5-flash',
        okrContext: okrContext || '',
        autoGenerateOKRs: !!autoGenerateOKRs,
        useAutoDiscovery: !!useAutoDiscovery,
        useStream: !!useStream
      };

      const res = await fetch(`${API_BASE}/async-dashboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!data.success) {
        renderError(cid, data.message || 'Erro ao carregar dashboard');
        return { success: false, error: data.message };
      }

      const { biConfig, rawResult, fromCache, generatedSql } = data;

      // Garante que DataCareBI está carregado antes de renderizar
      try {
        await ensureDataCareBI();
      } catch (e) {
        renderError(cid, 'DataCareBI.js não carregado. ' + (e.message || ''));
        return { success: false, error: e.message };
      }

      if (typeof window.DataCareBI !== 'undefined') {
        window.DataCareBI.applyLayout(biConfig, cid);
        window.DataCareBI.updateWidgetsWithData(biConfig, rawResult, cid);
        window.DataCareBI.attachSmartActions?.(biConfig, cid);
      } else {
        renderError(cid, 'DataCareBI.js não carregado');
        return { success: false };
      }

      return {
        success: true,
        biConfig,
        rawResult,
        fromCache,
        generatedSql
      };
    } catch (err) {
      console.error('[DataCareRenderer] initDashboard:', err);
      renderError(cid, err.message || 'Falha na comunicação');
      return { success: false, error: err.message };
    }
  }

  /**
   * Versão que usa layout e data em chamadas separadas (para integração com requestQuery bridge)
   */
  async function initDashboardStepwise(options, containerId) {
    const cid = containerId || 'dashboard-container';
    const { userPrompt, sqlQuery, model, okrContext, autoGenerateOKRs } = options || {};

    showSkeleton(cid);

    try {
      // Passo 2: IA define o layout (endpoint dedicado)
      const layoutRes = await fetch(`${API_BASE}/layout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt,
          sqlQuery,
          model: model || 'gemini-2.5-flash',
          okrContext: okrContext || '',
          autoGenerateOKRs: !!autoGenerateOKRs
        })
      });

      const layoutData = await layoutRes.json();
      if (!layoutData.success) {
        renderError(cid, layoutData.message || 'Erro ao gerar layout');
        return { success: false };
      }

      const { config: biConfig, metadata } = layoutData;

      // Passo 3: Build structure (sem dados)
      if (typeof window.DataCareBI !== 'undefined') {
        window.DataCareBI.applyLayout(biConfig, cid);
      }

      // Passo 4: Data vem via callback (requestQuery) - quem chama deve invocar:
      // DataCareBI.updateWidgetsWithData(biConfig, data, cid)
      return {
        success: true,
        biConfig,
        metadata,
        hydrate: (data) => {
          if (typeof window.DataCareBI !== 'undefined') {
            window.DataCareBI.updateWidgetsWithData(biConfig, data, cid);
            window.DataCareBI.attachSmartActions?.(biConfig, cid);
          }
        }
      };
    } catch (err) {
      console.error('[DataCareRenderer] initDashboardStepwise:', err);
      renderError(cid, err.message);
      return { success: false };
    }
  }

  function renderError(containerId, message) {
    const cid = containerId || 'dashboard-container';
    const container = document.getElementById(cid);
    if (!container) return;

    container.innerHTML = `
      <div class="p-8 flex flex-col items-center justify-center min-h-[300px]">
        <i class="fas fa-exclamation-triangle text-6xl text-rose-500 mb-4"></i>
        <p class="text-lg text-slate-700 mb-2">Erro ao carregar dashboard</p>
        <p class="text-sm text-slate-500">${escapeHtml(message)}</p>
      </div>
    `;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  /**
   * Orquestrador Elite - Fluxo "Bate Pronto" estilo Power BI/Metabase/WeKnow
   * 1. Skeleton instantâneo | 2. IA + Query em paralelo (quando cache) | 3. Build | 4. Hydrate
   */
  async function renderEliteDashboard(userRequest, containerId) {
    const cid = containerId || 'dashboard-container';
    showSkeleton(cid);
    try {
      const result = await initDashboard(userRequest, cid);
      if (result && result.success) {
        return { ...result, elapsed: 'elite' };
      }
      return result;
    } catch (err) {
      console.error('[DataCareRenderer] renderEliteDashboard:', err);
      renderError(cid, err.message);
      return { success: false, error: err.message };
    }
  }

  // API pública
  window.DataCareRenderer = {
    initDashboard,
    initDashboardStepwise,
    renderEliteDashboard,
    showSkeleton,
    renderError
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initDashboard, initDashboardStepwise, showSkeleton, renderError };
  }
})();
