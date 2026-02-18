/**
 * Cliente Redis opcional para cache de indicadores.
 * Se REDIS_URL não estiver definida, exporta null (fallback para cache em memória).
 * Uso: getClientSync() para checagem síncrona; getClientAsync() para operações (aguarda conexão).
 */
let client = null;
let connectPromise = null;

function getClientSync() {
  return client;
}

async function getClientAsync() {
  if (client) return client;
  if (connectPromise) return connectPromise;
  const url = process.env.REDIS_URL;
  if (!url || url.trim() === '') return null;
  try {
    const { createClient } = require('redis');
    client = createClient({ url });
    client.on('error', (err) => console.warn('[Redis]', err.message));
    connectPromise = client.connect().then(() => client).catch((e) => {
      client = null;
      connectPromise = null;
      return null;
    });
    return connectPromise;
  } catch (e) {
    return null;
  }
}

async function close() {
  if (client && client.quit) {
    await client.quit().catch(() => {});
    client = null;
    connectPromise = null;
  }
}

module.exports = { getClientSync, getClientAsync, close };
