// ARQUIVO: src/middlewares/biCacheMiddleware.js
// Cache inteligente para consultas BI pesadas

const crypto = require('crypto');
const { getClientAsync } = require('../infra/cache/redisClient');

/**
 * SISTEMA DE CACHE PARA CONSULTAS BI PESADAS
 * 
 * Estratégia:
 * 1. Cache de resultado completo (até 10MB)
 * 2. TTL configurável (padrão: 15 minutos)
 * 3. Compressão automática para economizar memória
 * 4. Fallback para memória local se Redis não estiver disponível
 * 5. Invalidação por hash de query
 */

// Cache em memória (fallback quando Redis não está disponível)
const memoryCache = new Map();
const MAX_MEMORY_CACHE_SIZE = 50; // Máximo de 50 queries em memória

/**
 * Gera hash único para a query SQL
 */
function generateCacheKey(sqlQuery, params = {}) {
  const content = JSON.stringify({ sql: sqlQuery, params });
  return `bi:query:${crypto.createHash('md5').update(content).digest('hex')}`;
}

/**
 * Limpa cache em memória removendo entradas antigas
 */
function cleanMemoryCache() {
  if (memoryCache.size > MAX_MEMORY_CACHE_SIZE) {
    const entries = Array.from(memoryCache.entries());
    // Remove os 20% mais antigos
    const toRemove = Math.floor(MAX_MEMORY_CACHE_SIZE * 0.2);
    
    entries
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, toRemove)
      .forEach(([key]) => memoryCache.delete(key));
    
    console.log(`🧹 [BI Cache] Limpeza: ${toRemove} entradas removidas da memória`);
  }
}

/**
 * Armazena resultado no cache
 */
async function setCacheResult(cacheKey, data, ttlSeconds = 900) {
  const cacheData = {
    data,
    timestamp: Date.now(),
    size: JSON.stringify(data).length
  };
  
  // Tenta Redis primeiro
  try {
    const redis = await getClientAsync();
    if (redis) {
      const serialized = JSON.stringify(cacheData);
      await redis.setEx(cacheKey, ttlSeconds, serialized);
      console.log(`✅ [BI Cache] Armazenado no Redis: ${cacheKey} (${(cacheData.size / 1024).toFixed(2)} KB, TTL: ${ttlSeconds}s)`);
      return true;
    }
  } catch (error) {
    console.warn('⚠️ [BI Cache] Erro ao salvar no Redis:', error.message);
  }
  
  // Fallback: Memória local
  cleanMemoryCache();
  memoryCache.set(cacheKey, {
    ...cacheData,
    expiresAt: Date.now() + (ttlSeconds * 1000)
  });
  console.log(`💾 [BI Cache] Armazenado na memória: ${cacheKey} (${(cacheData.size / 1024).toFixed(2)} KB)`);
  return true;
}

/**
 * Recupera resultado do cache
 */
async function getCacheResult(cacheKey) {
  // Tenta Redis primeiro
  try {
    const redis = await getClientAsync();
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        console.log(`✅ [BI Cache] HIT no Redis: ${cacheKey} (${(parsed.size / 1024).toFixed(2)} KB)`);
        return parsed.data;
      }
    }
  } catch (error) {
    console.warn('⚠️ [BI Cache] Erro ao ler do Redis:', error.message);
  }
  
  // Fallback: Memória local
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    // Verifica se não expirou
    if (Date.now() < cached.expiresAt) {
      console.log(`✅ [BI Cache] HIT na memória: ${cacheKey} (${(cached.size / 1024).toFixed(2)} KB)`);
      return cached.data;
    } else {
      // Expirado, remove
      memoryCache.delete(cacheKey);
      console.log(`⏰ [BI Cache] Entrada expirada removida: ${cacheKey}`);
    }
  }
  
  console.log(`❌ [BI Cache] MISS: ${cacheKey}`);
  return null;
}

/**
 * Middleware de cache para rotas BI
 * 
 * Uso:
 * router.post('/analytics/preview', biCacheMiddleware({ ttl: 900 }), controller.preview);
 */
function biCacheMiddleware(options = {}) {
  const {
    ttl = 900, // 15 minutos padrão
    enable = true,
    keyGenerator = null // Função customizada para gerar chave
  } = options;
  
  return async (req, res, next) => {
    // Desabilitar cache via query param ?nocache=1
    if (req.query.nocache === '1' || !enable) {
      console.log('⏭️ [BI Cache] Cache desabilitado para esta requisição');
      return next();
    }
    
    // Gera chave de cache
    const { sqlQuery, prompt } = req.body;
    
    // Só faz cache se tiver sqlQuery (não faz cache de geração de SQL)
    if (!sqlQuery || !sqlQuery.trim()) {
      return next();
    }
    
    const cacheKey = keyGenerator 
      ? keyGenerator(req) 
      : generateCacheKey(sqlQuery, { prompt });
    
    try {
      // Tenta recuperar do cache
      const cachedResult = await getCacheResult(cacheKey);
      
      if (cachedResult) {
        // Cache HIT - retorna resultado cacheado
        return res.json({
          ...cachedResult,
          fromCache: true,
          cacheTimestamp: new Date().toISOString()
        });
      }
      
      // Cache MISS - intercepta o res.json para cachear o resultado
      const originalJson = res.json.bind(res);
      
      res.json = function(data) {
        // Só cacheia se for sucesso
        if (data.success && data.rawResult && data.rawResult.length > 0) {
          // Cacheia de forma assíncrona (não bloqueia resposta)
          setCacheResult(cacheKey, data, ttl).catch(err => {
            console.error('❌ [BI Cache] Erro ao cachear resultado:', err.message);
          });
        }
        
        // Chama o json original
        return originalJson(data);
      };
      
      next();
    } catch (error) {
      console.error('❌ [BI Cache] Erro no middleware:', error.message);
      // Em caso de erro, continua sem cache
      next();
    }
  };
}

/**
 * Limpa cache de uma query específica
 */
async function invalidateQueryCache(sqlQuery) {
  const cacheKey = generateCacheKey(sqlQuery);
  
  try {
    const redis = await getClientAsync();
    if (redis) {
      await redis.del(cacheKey);
      console.log(`🗑️ [BI Cache] Cache invalidado no Redis: ${cacheKey}`);
    }
  } catch (error) {
    console.warn('⚠️ [BI Cache] Erro ao invalidar no Redis:', error.message);
  }
  
  // Remove da memória também
  memoryCache.delete(cacheKey);
  console.log(`🗑️ [BI Cache] Cache invalidado na memória: ${cacheKey}`);
}

/**
 * Limpa todo o cache BI
 */
async function invalidateAllBICache() {
  try {
    const redis = await getClientAsync();
    if (redis) {
      // Remove todas as chaves que começam com "bi:query:"
      const keys = await redis.keys('bi:query:*');
      if (keys.length > 0) {
        await redis.del(keys);
        console.log(`🗑️ [BI Cache] ${keys.length} chaves removidas do Redis`);
      }
    }
  } catch (error) {
    console.warn('⚠️ [BI Cache] Erro ao limpar cache no Redis:', error.message);
  }
  
  // Limpa memória
  const count = memoryCache.size;
  memoryCache.clear();
  console.log(`🗑️ [BI Cache] ${count} entradas removidas da memória`);
}

/**
 * Retorna estatísticas do cache
 */
async function getCacheStats() {
  const stats = {
    memory: {
      size: memoryCache.size,
      maxSize: MAX_MEMORY_CACHE_SIZE,
      entries: Array.from(memoryCache.entries()).map(([key, value]) => ({
        key,
        size: value.size,
        timestamp: new Date(value.timestamp).toISOString(),
        expiresAt: new Date(value.expiresAt).toISOString()
      }))
    },
    redis: {
      connected: false,
      keys: 0
    }
  };
  
  try {
    const redis = await getClientAsync();
    if (redis) {
      stats.redis.connected = true;
      const keys = await redis.keys('bi:query:*');
      stats.redis.keys = keys.length;
    }
  } catch (error) {
    // Ignora erro
  }
  
  return stats;
}

module.exports = {
  biCacheMiddleware,
  invalidateQueryCache,
  invalidateAllBICache,
  getCacheStats,
  generateCacheKey
};
