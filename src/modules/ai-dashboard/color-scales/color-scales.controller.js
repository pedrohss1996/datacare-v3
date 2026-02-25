/**
 * Controller - Escalas de cor (CRUD)
 */
const db = require('../../../infra/database/connection');

async function list(req, res) {
  try {
    const list = await db('ai_color_scales').orderBy('name');
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error('[ai-dashboard] list color scales', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function create(req, res) {
  try {
    const { name, colors } = req.body;
    if (!name || !Array.isArray(colors) || !colors.length) {
      return res.status(400).json({ success: false, message: 'name e colors (array de hex) são obrigatórios.' });
    }
    const hexColors = colors.filter((c) => typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c.trim())).slice(0, 12);
    if (!hexColors.length) {
      return res.status(400).json({ success: false, message: 'Informe pelo menos uma cor em formato hex (ex: #0d9488).' });
    }
    const [row] = await db('ai_color_scales').insert({ name, colors: hexColors }).returning('*');
    return res.status(201).json({ success: true, data: row });
  } catch (err) {
    console.error('[ai-dashboard] create color scale', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const { name, colors } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (Array.isArray(colors)) {
      const hexColors = colors.filter((c) => typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c.trim())).slice(0, 12);
      updates.colors = hexColors.length ? hexColors : undefined;
    }
    const [row] = await db('ai_color_scales').where({ id }).update(updates).returning('*');
    if (!row) return res.status(404).json({ success: false, message: 'Escala não encontrada.' });
    return res.json({ success: true, data: row });
  } catch (err) {
    console.error('[ai-dashboard] update color scale', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function remove(req, res) {
  try {
    const deleted = await db('ai_color_scales').where({ id: req.params.id }).del();
    if (!deleted) return res.status(404).json({ success: false, message: 'Escala não encontrada.' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[ai-dashboard] delete color scale', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function getById(req, res) {
  try {
    const row = await db('ai_color_scales').where({ id: req.params.id }).first();
    if (!row) return res.status(404).json({ success: false, message: 'Escala não encontrada.' });
    return res.json({ success: true, data: row });
  } catch (err) {
    console.error('[ai-dashboard] get color scale', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { list, create, update, remove, getById };
