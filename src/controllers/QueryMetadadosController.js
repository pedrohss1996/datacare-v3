/**
 * QueryMetadadosController - API para Gerenciador de Metadados de Queries
 * CRUD + endpoint de dicionário para a Engine IA.
 */
const QueryMetadadosService = require('../services/QueryMetadadosService');

const controller = {
  /**
   * GET /api/query-metadados - Lista metadados (com filtros)
   * Query params: modulo, fonte_dados, tag, busca, hospital_id
   */
  listar: async (req, res) => {
    try {
      const filtros = {
        modulo: req.query.modulo,
        fonte_dados: req.query.fonte_dados,
        tag: req.query.tag,
        busca: req.query.busca,
        hospital_id: req.query.hospital_id != null ? parseInt(req.query.hospital_id, 10) : null
      };
      const rows = await QueryMetadadosService.listar(filtros);
      return res.json({ success: true, data: rows });
    } catch (erro) {
      console.error('[QueryMetadados] listar:', erro);
      return res.status(500).json({ success: false, message: erro.message });
    }
  },

  /**
   * GET /api/query-metadados/dicionario - Dicionário para a IA (SEM SQL)
   */
  dicionario: async (req, res) => {
    try {
      const filtros = {
        modulo: req.query.modulo,
        tag: req.query.tag,
        hospital_id: req.query.hospital_id != null ? parseInt(req.query.hospital_id, 10) : null
      };
      const dicionario = await QueryMetadadosService.getDicionarioParaIA(filtros);
      return res.json({ success: true, dicionario });
    } catch (erro) {
      console.error('[QueryMetadados] dicionario:', erro);
      return res.status(500).json({ success: false, message: erro.message });
    }
  },

  /**
   * GET /api/query-metadados/:id - Busca por ID
   */
  buscarPorId: async (req, res) => {
    try {
      const { id } = req.params;
      const row = await QueryMetadadosService.buscarPorId(id);
      if (!row) {
        return res.status(404).json({ success: false, message: 'Metadado não encontrado.' });
      }
      return res.json({ success: true, data: row });
    } catch (erro) {
      console.error('[QueryMetadados] buscarPorId:', erro);
      return res.status(500).json({ success: false, message: erro.message });
    }
  },

  /**
   * GET /api/query-metadados/cod/:queryCod - Busca por query_cod
   */
  buscarPorCod: async (req, res) => {
    try {
      const { queryCod } = req.params;
      const hospitalId = req.query.hospital_id != null ? parseInt(req.query.hospital_id, 10) : null;
      const row = await QueryMetadadosService.buscarPorCod(queryCod, hospitalId);
      if (!row) {
        return res.status(404).json({ success: false, message: 'Query não encontrada.' });
      }
      // Retorna metadados mas NÃO expõe query_sql em resposta pública (segurança)
      const { query_sql, ...safe } = row;
      return res.json({ success: true, data: safe });
    } catch (erro) {
      console.error('[QueryMetadados] buscarPorCod:', erro);
      return res.status(500).json({ success: false, message: erro.message });
    }
  },

  /**
   * POST /api/query-metadados - Cria novo metadado
   */
  criar: async (req, res) => {
    try {
      const dados = req.body;
      const row = await QueryMetadadosService.criar(dados);
      return res.status(201).json({ success: true, data: row });
    } catch (erro) {
      console.error('[QueryMetadados] criar:', erro);
      const status = erro.message.includes('obrigatório') || erro.message.includes('existe') ? 400 : 500;
      return res.status(status).json({ success: false, message: erro.message });
    }
  },

  /**
   * PUT /api/query-metadados/:id - Atualiza metadado
   */
  atualizar: async (req, res) => {
    try {
      const { id } = req.params;
      const dados = req.body;
      const row = await QueryMetadadosService.atualizar(id, dados);
      return res.json({ success: true, data: row });
    } catch (erro) {
      console.error('[QueryMetadados] atualizar:', erro);
      const status = erro.message.includes('não encontrado') ? 404 : 500;
      return res.status(status).json({ success: false, message: erro.message });
    }
  },

  /**
   * DELETE /api/query-metadados/:id - Desativa metadado (soft delete)
   */
  desativar: async (req, res) => {
    try {
      const { id } = req.params;
      const row = await QueryMetadadosService.desativar(id);
      if (!row) {
        return res.status(404).json({ success: false, message: 'Metadado não encontrado.' });
      }
      return res.json({ success: true, data: row });
    } catch (erro) {
      console.error('[QueryMetadados] desativar:', erro);
      return res.status(500).json({ success: false, message: erro.message });
    }
  }
};

module.exports = controller;
