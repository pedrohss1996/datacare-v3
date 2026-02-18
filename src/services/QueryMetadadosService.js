/**
 * QueryMetadadosService - Gerenciador de Metadados de Queries
 * Cataloga as funções/consultas do hospital para a Engine de Geração de Páginas Inteligentes.
 *
 * REGRA DE OURO: SQL jamais vem do frontend. A IA só envia query_cod.
 */
const crypto = require('crypto');
const db = require('../infra/database/connection');

const TABLE = 'query_metadados';

/**
 * Gera query_cod único (hash MD5 do nome + sql normalizado)
 * Usado pelo frontend - nunca envia o SQL.
 */
function gerarQueryCod(nome, querySql) {
  const normalizado = `${String(nome || '').trim()}|${String(querySql || '').trim()}`;
  return crypto.createHash('md5').update(normalizado).digest('hex');
}

/**
 * Valida estrutura de colunas
 * Esperado: [ { nome: string, tipo?: string, descricao?: string, alias?: string } ]
 */
function validarColunas(colunas) {
  if (!Array.isArray(colunas)) return [];
  return colunas.filter(c => c && typeof c.nome === 'string' && c.nome.trim());
}

/**
 * Valida estrutura de variáveis (placeholders no SQL)
 * Esperado: [ { nome: string, tipo?: string, default?: any, obrigatorio?: boolean } ]
 */
function validarVariaveis(variaveis) {
  if (!Array.isArray(variaveis)) return [];
  return variaveis.filter(v => v && typeof v.nome === 'string' && v.nome.trim());
}

/**
 * Valida tags (array de strings)
 */
function validarTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim().toLowerCase());
}

/**
 * Lista metadados (com filtros opcionais)
 */
async function listar(filtros = {}) {
  let q = db(TABLE).where('ativo', true);

  if (filtros.modulo) {
    q = q.where('modulo_funcional', filtros.modulo);
  }
  if (filtros.fonte_dados) {
    q = q.where('fonte_dados', filtros.fonte_dados);
  }
  if (filtros.hospital_id != null) {
    q = q.where('hospital_id', filtros.hospital_id);
  }
  if (filtros.tag) {
    q = q.whereRaw("tags @> ?::jsonb", [JSON.stringify([filtros.tag.toLowerCase()])]);
  }
  if (filtros.busca) {
    const termo = `%${filtros.busca}%`;
    q = q.where(function() {
      this.where('nome', 'ilike', termo)
        .orWhere('descricao', 'ilike', termo)
        .orWhere('query_cod', 'ilike', termo);
    });
  }

  const rows = await q.orderBy('modulo_funcional', 'asc').orderBy('nome', 'asc');
  return rows.map(normalizarRegistro);
}

/**
 * Busca por query_cod (usado pelo handler requestQuery)
 */
async function buscarPorCod(queryCod, hospitalId = null) {
  let q = db(TABLE).where('query_cod', queryCod).where('ativo', true);
  if (hospitalId != null) {
    q = q.andWhere(function() {
      this.where('hospital_id', hospitalId).orWhereNull('hospital_id');
    });
  }
  const row = await q.first();
  return row ? normalizarRegistro(row) : null;
}

/**
 * Busca por ID
 */
async function buscarPorId(id) {
  const row = await db(TABLE).where('id', id).first();
  return row ? normalizarRegistro(row) : null;
}

/**
 * Cria novo metadado
 */
async function criar(dados) {
  const { nome, descricao, modulo_funcional, fonte_dados, query_sql, colunas, variaveis, tags, hospital_id } = dados;

  if (!nome || !query_sql) {
    throw new Error('nome e query_sql são obrigatórios.');
  }

  const queryCod = gerarQueryCod(nome, query_sql);

  // Verifica duplicidade
  const existente = await db(TABLE).where('query_cod', queryCod).first();
  if (existente) {
    throw new Error(`Já existe uma query com o mesmo código (${queryCod}). Altere o nome ou o SQL.`);
  }

  const payload = {
    query_cod: queryCod,
    nome: String(nome).trim(),
    descricao: descricao ? String(descricao).trim() : null,
    modulo_funcional: modulo_funcional ? String(modulo_funcional).trim() : null,
    fonte_dados: ['oracle', 'postgres'].includes(String(fonte_dados || '')) ? fonte_dados : 'oracle',
    query_sql: String(query_sql).trim(),
    colunas: JSON.stringify(validarColunas(colunas || [])),
    variaveis: JSON.stringify(validarVariaveis(variaveis || [])),
    tags: JSON.stringify(validarTags(tags || [])),
    hospital_id: hospital_id || null,
    ativo: true
  };

  const [inserted] = await db(TABLE).insert(payload).returning('*');
  return normalizarRegistro(inserted);
}

/**
 * Atualiza metadado (não altera query_cod se mudar sql - manter consistência)
 */
async function atualizar(id, dados) {
  const existente = await db(TABLE).where('id', id).first();
  if (!existente) {
    throw new Error('Metadado não encontrado.');
  }

  const { nome, descricao, modulo_funcional, fonte_dados, query_sql, colunas, variaveis, tags, hospital_id, ativo } = dados;

  const payload = {};
  if (nome !== undefined) payload.nome = String(nome).trim();
  if (descricao !== undefined) payload.descricao = descricao ? String(descricao).trim() : null;
  if (modulo_funcional !== undefined) payload.modulo_funcional = modulo_funcional ? String(modulo_funcional).trim() : null;
  if (fonte_dados !== undefined) payload.fonte_dados = ['oracle', 'postgres'].includes(String(fonte_dados)) ? fonte_dados : existente.fonte_dados;
  if (query_sql !== undefined) payload.query_sql = String(query_sql).trim();
  if (colunas !== undefined) payload.colunas = JSON.stringify(validarColunas(colunas));
  if (variaveis !== undefined) payload.variaveis = JSON.stringify(validarVariaveis(variaveis));
  if (tags !== undefined) payload.tags = JSON.stringify(validarTags(tags));
  if (hospital_id !== undefined) payload.hospital_id = hospital_id || null;
  if (ativo !== undefined) payload.ativo = !!ativo;

  const [updated] = await db(TABLE).where('id', id).update(payload).returning('*');
  return normalizarRegistro(updated);
}

/**
 * Desativa (soft delete)
 */
async function desativar(id) {
  const [updated] = await db(TABLE).where('id', id).update({ ativo: false }).returning('*');
  return updated ? normalizarRegistro(updated) : null;
}

/**
 * Retorna dicionário para a IA (apenas metadados, SEM o SQL)
 */
async function getDicionarioParaIA(filtros = {}) {
  const rows = await listar(filtros);
  return rows.map(r => ({
    id: r.query_cod,
    nome: r.nome,
    descricao: r.descricao,
    modulo: r.modulo_funcional,
    colunas: r.colunas,
    variaveis: r.variaveis,
    tags: r.tags,
    fonte_dados: r.fonte_dados
  }));
}

/**
 * Normaliza registro (parse JSON)
 */
function normalizarRegistro(row) {
  if (!row) return null;
  const r = { ...row };
  if (typeof r.colunas === 'string') r.colunas = JSON.parse(r.colunas || '[]');
  if (typeof r.variaveis === 'string') r.variaveis = JSON.parse(r.variaveis || '[]');
  if (typeof r.tags === 'string') r.tags = JSON.parse(r.tags || '[]');
  return r;
}

module.exports = {
  TABLE,
  gerarQueryCod,
  listar,
  buscarPorCod,
  buscarPorId,
  criar,
  atualizar,
  desativar,
  getDicionarioParaIA,
  validarColunas,
  validarVariaveis
};
