/**
 * Controller - Datasets (CRUD + executar)
 */
const db = require('../../../infra/database/connection');
const { validateSQL } = require('../utils/validateSQL');
const datasetService = require('../datasets/dataset.service');

async function list(req, res) {
  try {
    const list = await db('ai_datasets')
      .select('ai_datasets.*', 'c.name as connection_name')
      .leftJoin('ai_oracle_connections as c', 'ai_datasets.oracle_connection_id', 'c.id')
      .orderBy('ai_datasets.name');
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error('[ai-dashboard] list datasets', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function create(req, res) {
  try {
    const { name, sql_original, oracle_connection_id } = req.body;
    if (!name || !sql_original || !oracle_connection_id) {
      return res.status(400).json({ success: false, message: 'name, sql_original e oracle_connection_id são obrigatórios.' });
    }
    const validation = validateSQL(sql_original);
    if (!validation.valid) return res.status(400).json({ success: false, message: validation.error });
    const [row] = await db('ai_datasets').insert({ name, sql_original, oracle_connection_id }).returning('*');
    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    console.error('[ai-dashboard] create dataset', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const { name, sql_original, oracle_connection_id } = req.body;
    if (sql_original) {
      const validation = validateSQL(sql_original);
      if (!validation.valid) return res.status(400).json({ success: false, message: validation.error });
    }
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (sql_original !== undefined) updates.sql_original = sql_original;
    if (oracle_connection_id !== undefined) updates.oracle_connection_id = oracle_connection_id;
    const [row] = await db('ai_datasets').where({ id }).update(updates).returning('*');
    if (!row) return res.status(404).json({ success: false, message: 'Dataset não encontrado.' });
    return res.json({ success: true, data: row });
  } catch (err) {
    console.error('[ai-dashboard] update dataset', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function remove(req, res) {
  try {
    const deleted = await db('ai_datasets').where({ id: req.params.id }).del();
    if (!deleted) return res.status(404).json({ success: false, message: 'Dataset não encontrado.' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[ai-dashboard] delete dataset', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function getById(req, res) {
  try {
    const row = await db('ai_datasets').where({ id: req.params.id }).first();
    if (!row) return res.status(404).json({ success: false, message: 'Dataset não encontrado.' });
    return res.json({ success: true, data: row });
  } catch (err) {
    console.error('[ai-dashboard] get dataset', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function execute(req, res) {
  try {
    const result = await datasetService.executeDataset(req.params.id);
    return res.json({
      success: true,
      data: {
        rowsCount: result.rowsCount,
        oracleRows: result.oracleRows,
        tableName: result.tableName,
        message: `${result.rowsCount} registros buscados do Oracle e armazenados.`,
      },
    });
  } catch (err) {
    console.error('[ai-dashboard] execute dataset', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function previewById(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const result = await datasetService.previewQuery(req.params.id, null, null, limit);
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[ai-dashboard] preview dataset', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function previewAdHoc(req, res) {
  try {
    const { oracle_connection_id, sql_original } = req.body;
    const limit = Math.min(parseInt(req.body.limit, 10) || 100, 500);
    const result = await datasetService.previewQuery(null, oracle_connection_id, sql_original, limit);
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[ai-dashboard] preview ad-hoc', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function getData(req, res) {
  try {
    const limitParam = req.query.limit;
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 0, 500000) : 0;
    const data = await datasetService.getDatasetData(req.params.id, limit);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[ai-dashboard] get dataset data', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { list, create, update, remove, getById, execute, previewById, previewAdHoc, getData };
