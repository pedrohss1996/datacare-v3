// src/controllers/pageBuilderController.js

const aiService = require('../services/aiService');
const { dbApp: db } = require('../infra/database/connection'); // <--- NÃO ESQUEÇA DISSO!

// 1. Renderiza a tela do Construtor
exports.renderBuilder = (req, res) => {
    res.render('pages/builder/editor', { 
        title: 'Construtor de Páginas - DataCare',
        layout: 'layouts/main',
        user: req.user || { name: 'Admin', role: 'TI' }
    });
};

// 2. Gera o código via IA (Chamado pelo Chat)
exports.generateCode = async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt vazio' });

        const html = await aiService.generateComponent(prompt);
        res.json({ success: true, html });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Erro no servidor' });
    }
};

// 3. Salva a página no banco (Chamado pelo botão Salvar)
exports.savePage = async (req, res) => {
    try {
        // Agora usando os nomes em PORTUGUÊS da tabela nova
        const { title, slug, html } = req.body; 

        if (!title || !slug || !html) {
            return res.status(400).json({ success: false, error: 'Dados incompletos.' });
        }

        const paginaExistente = await db('paginas_personalizadas').where({ slug }).first();

        if (paginaExistente) {
            await db('paginas_personalizadas').where({ slug }).update({ 
                titulo: title,
                conteudo_html: html
                // atualizado_em é automático pelo trigger
            });
        } else {
            await db('paginas_personalizadas').insert({ 
                titulo: title, 
                slug: slug, 
                conteudo_html: html,
                publicada: true
            });
        }

        res.json({ success: true, link: `/p/${slug}` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Erro ao salvar.' });
    }
};

// 4. AQUI ESTÁ ELE: Renderiza a página pronta para o usuário ver
exports.renderPublishedPage = async (req, res) => {
    try {
        const { slug } = req.params;
        
        const pagina = await db('paginas_personalizadas').where({ slug }).first();

        if (!pagina) return res.status(404).send('Página não encontrada');

        // AGORA SIM: Renderiza a 'view.ejs' passando o HTML do banco
        res.render('pages/builder/view', {
            title: pagina.titulo,
            layout: 'layouts/main', // Usa o layout padrão do sistema
            html: pagina.conteudo_html, // Manda o HTML para a moldura
            user: req.user || { name: 'Visitante', role: 'Viewer' }
        });

    } catch (error) {
        res.send('Erro ao carregar página: ' + error.message);
    }
};

// 5. NOVA: Listar todas as páginas
exports.listPages = async (req, res) => {
    try {
        // Busca apenas os dados essenciais para a lista
        const paginas = await db('paginas_personalizadas')
            .select('id', 'titulo', 'slug', 'criado_em', 'visualizacoes')
            .orderBy('criado_em', 'desc');

        res.render('pages/builder/list', {
            title: 'Gerenciar Páginas - DataCare',
            layout: 'layouts/main',
            user: req.user || { name: 'Admin', role: 'TI' },
            paginas: paginas
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Erro ao buscar páginas');
    }
};

// 6. NOVA: Excluir página
exports.deletePage = async (req, res) => {
    try {
        const { id } = req.params;
        await db('paginas_personalizadas').where({ id }).del();
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Erro ao excluir página.' });
    }
};