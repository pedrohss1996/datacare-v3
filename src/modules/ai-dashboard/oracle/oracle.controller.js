/**
 * Controller - Conexões Oracle (CRUD)
 */
const db = require('../../../infra/database/connection');
const { encryptPassword } = require('../utils/encrypt');
const oracleService = require('../oracle/oracle.service');

async function list(req, res) {
  try {
    const list = await db('ai_oracle_connections').orderBy('name');
    return res.json({ success: true, data: list.map((r) => ({ ...r, password_encrypted: undefined })) });
  } catch (err) {
    console.error('[ai-dashboard] list connections', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function create(req, res) {
  try {
    const { name, host, port, service_name, username, password } = req.body;
    if (!name || !host || !service_name || !username || !password) {
      return res.status(400).json({ success: false, message: 'Preencha todos os campos: nome, host, service name, usuário e senha.' });
    }
    let password_encrypted;
    try {
      password_encrypted = encryptPassword(password);
    } catch (encErr) {
      return res.status(400).json({
        success: false,
        message: 'Configure a criptografia: no .env defina AI_DASHBOARD_ENCRYPTION_KEY (ou SESSION_SECRET) com pelo menos 32 caracteres e reinicie o servidor.',
      });
    }
    const result = await db('ai_oracle_connections').insert({
      name,
      host,
      port: port || 1521,
      service_name,
      username,
      password_encrypted,
    }).returning('*');
    const row = Array.isArray(result) ? result[0] : result;
    return res.status(201).json({ success: true, data: row ? { ...row, password_encrypted: undefined } : { name, host, port: port || 1521, service_name, username } });
  } catch (err) {
    console.error('[ai-dashboard] create connection', err);
    return res.status(500).json({ success: false, message: err.message || 'Erro ao salvar conexão.' });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const { name, host, port, service_name, username, password } = req.body;
    const updates = { name, host, port: port || 1521, service_name, username };
    if (password) {
      try {
        updates.password_encrypted = encryptPassword(password);
      } catch (encErr) {
        return res.status(400).json({
          success: false,
          message: 'Configure AI_DASHBOARD_ENCRYPTION_KEY (ou SESSION_SECRET) com pelo menos 32 caracteres no .env.',
        });
      }
    }
    const result = await db('ai_oracle_connections').where({ id }).update(updates).returning('*');
    const row = Array.isArray(result) ? result[0] : result;
    if (!row) return res.status(404).json({ success: false, message: 'Conexão não encontrada.' });
    return res.json({ success: true, data: { ...row, password_encrypted: undefined } });
  } catch (err) {
    console.error('[ai-dashboard] update connection', err);
    return res.status(500).json({ success: false, message: err.message || 'Erro ao atualizar.' });
  }
}

async function remove(req, res) {
  try {
    const deleted = await db('ai_oracle_connections').where({ id: req.params.id }).del();
    if (!deleted) return res.status(404).json({ success: false, message: 'Conexão não encontrada.' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[ai-dashboard] delete connection', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function test(req, res) {
  try {
    const conn = await db('ai_oracle_connections').where({ id: req.params.id }).first();
    if (!conn) return res.status(404).json({ success: false, message: 'Conexão não encontrada.' });
    const ok = await oracleService.testConnection(conn);
    return res.json({ success: ok, message: ok ? 'Conexão OK.' : 'Falha ao conectar.' });
  } catch (err) {
    console.error('[ai-dashboard] test connection', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { list, create, update, remove, test };
