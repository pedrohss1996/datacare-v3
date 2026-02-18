/**
 * Cache em memória para dados de dashboards IA (queries pesadas).
 * TTL configurável por dashboard - padrão 30 minutos para queries pesadas.
 */

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutos (mais tempo que indicadores normais)
const cache = new Map();
const metadata = new Map(); // Armazena metadados (timestamp, tamanho, etc)

/**
 * Gera chave única para o cache
 */
function chave(dashboardId) {
    return `dashboard_${dashboardId}`;
}

/**
 * Busca dados do cache
 * @param {number} dashboardId - ID do dashboard
 * @returns {object|null} - Dados em cache ou null se expirado/inexistente
 */
function get(dashboardId) {
    const k = chave(dashboardId);
    const item = cache.get(k);
    
    if (!item) {
        console.log(`[Cache Dashboard] ❌ Cache MISS para Dashboard ${dashboardId}`);
        return null;
    }
    
    if (Date.now() > item.exp) {
        console.log(`[Cache Dashboard] ⏰ Cache EXPIRADO para Dashboard ${dashboardId}`);
        cache.delete(k);
        metadata.delete(k);
        return null;
    }
    
    const meta = metadata.get(k);
    const age = Math.round((Date.now() - meta.timestamp) / 1000); // segundos
    console.log(`[Cache Dashboard] ✅ Cache HIT para Dashboard ${dashboardId} (idade: ${age}s, registros: ${meta.recordCount})`);
    
    return item.val;
}

/**
 * Armazena dados no cache
 * @param {number} dashboardId - ID do dashboard
 * @param {array} data - Dados a serem cacheados
 * @param {number} ttlMs - Tempo de vida em milissegundos (opcional)
 */
function set(dashboardId, data, ttlMs = DEFAULT_TTL_MS) {
    const k = chave(dashboardId);
    const exp = Date.now() + ttlMs;
    
    cache.set(k, { val: data, exp });
    metadata.set(k, {
        timestamp: Date.now(),
        recordCount: Array.isArray(data) ? data.length : 0,
        ttlMs,
        expiresAt: new Date(exp).toISOString()
    });
    
    console.log(`[Cache Dashboard] 💾 Dados salvos no cache para Dashboard ${dashboardId} (${Array.isArray(data) ? data.length : 0} registros, TTL: ${Math.round(ttlMs / 60000)}min)`);
}

/**
 * Invalida cache de um dashboard específico
 * @param {number} dashboardId - ID do dashboard
 */
function invalidate(dashboardId) {
    const k = chave(dashboardId);
    const deleted = cache.delete(k);
    metadata.delete(k);
    
    if (deleted) {
        console.log(`[Cache Dashboard] 🗑️ Cache invalidado para Dashboard ${dashboardId}`);
    }
    
    return deleted;
}

/**
 * Retorna metadados do cache (para debug/monitoramento)
 * @param {number} dashboardId - ID do dashboard
 */
function getMetadata(dashboardId) {
    const k = chave(dashboardId);
    return metadata.get(k) || null;
}

/**
 * Limpa todo o cache de dashboards
 */
function clear() {
    const size = cache.size;
    cache.clear();
    metadata.clear();
    console.log(`[Cache Dashboard] 🧹 Cache limpo (${size} itens removidos)`);
}

/**
 * Retorna estatísticas do cache
 */
function getStats() {
    const stats = {
        totalItems: cache.size,
        items: []
    };
    
    for (const [key, meta] of metadata.entries()) {
        const item = cache.get(key);
        const isExpired = item ? Date.now() > item.exp : true;
        
        stats.items.push({
            key,
            recordCount: meta.recordCount,
            age: Math.round((Date.now() - meta.timestamp) / 1000),
            ttl: Math.round(meta.ttlMs / 60000),
            expired: isExpired,
            expiresAt: meta.expiresAt
        });
    }
    
    return stats;
}

module.exports = { 
    get, 
    set, 
    invalidate, 
    getMetadata,
    clear,
    getStats,
    DEFAULT_TTL_MS
};
