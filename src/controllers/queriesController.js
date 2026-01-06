const db = require('../infra/database/connection'); // Ou ../database/connection

module.exports = {
    // 1. LISTA (A tela dos cards)
    index: async (req, res) => {
        try {
            const queries = await db('gerenciador_queries').orderBy('criado_em', 'desc');
            res.render('pages/queries/index', {
                title: 'Gerenciador de Queries',
                layout: 'layouts/main',
                queries: queries,
                user: req.user
            });
        } catch (err) {
            console.error(err);
            res.redirect('/');
        }
    },

    // 2. SALVAR (Cria ou Atualiza)
    salvar: async (req, res) => {
        const { id, titulo, descricao, tipo_banco, query_sql } = req.body;
        
        try {
            if (id) {
                // Update
                await db('gerenciador_queries').where({ id }).update({
                    titulo, descricao, tipo_banco, query_sql, atualizado_em: new Date()
                });
            } else {
                // Create
                await db('gerenciador_queries').insert({
                    titulo, descricao, tipo_banco, query_sql
                });
            }
            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, error: err.message });
        }
    },

    // 3. EXCLUIR
    excluir: async (req, res) => {
        try {
            await db('gerenciador_queries').where({ id: req.params.id }).del();
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false });
        }
    },

    // 4. API PARA PEGAR UMA QUERY (Usado no Modal de Edição)
    buscar: async (req, res) => {
        try {
            const query = await db('gerenciador_queries').where({ id: req.params.id }).first();
            res.json(query);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar query' });
        }
    }
};