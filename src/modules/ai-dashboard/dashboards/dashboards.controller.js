/**
 * Controller - Dashboards (CRUD + gerar config com IA)
 */
const db = require('../../../infra/database/connection');
const datasetService = require('../datasets/dataset.service');
const aiService = require('../ai/ai.service');

async function chat(req, res) {
  try {
    const { datasetId, messages, currentConfig, modelId } = req.body;
    if (!datasetId || !Array.isArray(messages)) {
      return res.status(400).json({ success: false, message: 'datasetId e messages (array) são obrigatórios.' });
    }
    const result = await aiService.chatDashboard(datasetId, messages, currentConfig || null, modelId);
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[ai-dashboard] chat', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function list(req, res) {
  try {
    const list = await db('ai_dashboards')
      .select('ai_dashboards.*', 'd.name as dataset_name')
      .leftJoin('ai_datasets as d', 'ai_dashboards.dataset_id', 'd.id')
      .orderBy('ai_dashboards.created_at', 'desc');
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error('[ai-dashboard] list dashboards', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function create(req, res) {
  try {
    const { name, dataset_id, config_json, html_content } = req.body;
    if (!name || !dataset_id) {
      return res.status(400).json({ success: false, message: 'name e dataset_id são obrigatórios.' });
    }
    const config = config_json && typeof config_json === 'object' ? config_json : {};
    const [row] = await db('ai_dashboards')
      .insert({ name, dataset_id, config_json: config, html_content: html_content || null })
      .returning('*');
    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    console.error('[ai-dashboard] create dashboard', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const { name, config_json, html_content } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (config_json !== undefined) updates.config_json = config_json;
    if (html_content !== undefined) updates.html_content = html_content;
    const [row] = await db('ai_dashboards').where({ id }).update(updates).returning('*');
    if (!row) return res.status(404).json({ success: false, message: 'Dashboard não encontrado.' });
    return res.json({ success: true, data: row });
  } catch (err) {
    console.error('[ai-dashboard] update dashboard', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function remove(req, res) {
  try {
    const deleted = await db('ai_dashboards').where({ id: req.params.id }).del();
    if (!deleted) return res.status(404).json({ success: false, message: 'Dashboard não encontrado.' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[ai-dashboard] delete dashboard', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function getById(req, res) {
  try {
    const row = await db('ai_dashboards').where({ id: req.params.id }).first();
    if (!row) return res.status(404).json({ success: false, message: 'Dashboard não encontrado.' });
    return res.json({ success: true, data: row });
  } catch (err) {
    console.error('[ai-dashboard] get dashboard', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function getData(req, res) {
  try {
    const dashboard = await db('ai_dashboards').where({ id: req.params.id }).first();
    if (!dashboard) return res.status(404).json({ success: false, message: 'Dashboard não encontrado.' });
    const limitParam = req.query.limit;
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 0, 500000) : 0;
    const data = await datasetService.getDatasetData(dashboard.dataset_id, limit);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[ai-dashboard] get dashboard data', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function getDefaultConfig(req, res) {
  try {
    const datasetId = req.params.datasetId || req.params.id;
    if (!datasetId) return res.status(400).json({ success: false, message: 'datasetId é obrigatório.' });
    const config = await aiService.getDefaultDashboardConfig(datasetId);
    return res.json({ success: true, data: { config } });
  } catch (err) {
    console.error('[ai-dashboard] get default config', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function getDefaultHtml(req, res) {
  try {
    const datasetId = req.params.datasetId || req.params.id;
    if (!datasetId) return res.status(400).json({ success: false, message: 'datasetId é obrigatório.' });
    const html = await aiService.getDefaultDashboardHtml(datasetId);
    return res.json({ success: true, data: { html } });
  } catch (err) {
    console.error('[ai-dashboard] get default html', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { list, create, update, remove, getById, getData, getDefaultConfig, getDefaultHtml, chat };
