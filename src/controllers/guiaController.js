/**
 * GuiaController - Recebe upload da guia, orquestra OCR (ou fallback) e retorna DTO para conferência.
 * Stack: Express + EJS + Vanilla JS (.cursorrules).
 */

const fs = require('fs');
const guiaService = require('../services/guiaService');

const guiaController = {
  /**
   * GET /smart - Renderiza a página Smart (upload + formulário de conferência).
   */
  index(req, res) {
    res.render('pages/smart/index', {
      title: 'Smart - Abertura Zero Toque | DataCare',
      layout: 'layouts/main',
      user: req.user || req.session?.user,
    });
  },

  /**
   * POST /api/atendimentos/upload-guia
   * Recebe multipart (imagem da guia). Sempre retorna 200 com dados (OCR ou fallback para preenchimento manual).
   */
  async uploadGuia(req, res) {
    if (!req.file || !req.file.path) {
      return res.status(400).json({
        success: false,
        error: 'Nenhum arquivo enviado. Envie uma imagem (JPG/PNG) da guia.',
      });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname || 'guia.jpg';

    try {
      const resultado = await guiaService.processarUploadGuia(filePath, originalName);
      return res.json({
        success: true,
        data: resultado,
      });
    } catch (err) {
      console.error('Erro ao processar guia:', err.message || err);
      return res.status(500).json({
        success: false,
        error: err.response?.data?.detail || err.message || 'Erro ao processar guia.',
      });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {
          console.warn('Falha ao remover arquivo temporário:', e.message);
        }
      }
    }
  },
};

module.exports = guiaController;
