// src/controllers/pageBuilderController.js
const aiService = require('../services/aiService');

// Renderiza a tela principal do construtor
exports.renderBuilder = (req, res) => {
    res.render('pages/page-builder', {
        title: 'Criador de Páginas IA - Hospital Core',
        layout: 'layouts/main',
        user: { 
            name: 'Marlon Braga', 
            role: 'Administrador TI' 
        }
    });
};

// Recebe o POST via fetch (AJAX) e devolve JSON
exports.generateCode = async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'O prompt é obrigatório.' });
        }

        const html = await aiService.generateComponent(prompt);
        
        // Retorna o HTML gerado para o front-end
        res.json({ success: true, html });

    } catch (error) {
        res.status(500).json({ success: false, error: 'Erro ao comunicar com a IA.' });
    }
};