const db = require('../infra/database/connection');

module.exports = {
    index: async (req, res) => {
        try {
            const usuarioId = req.session.user.id; // ID do atendente logado

            // 1. Busca tickets que estão na FILA (ninguém pegou ainda)
            const fila = await db('chat_tickets')
                .where('status', 'FILA')
                .orderBy('criado_em', 'asc');

            // 2. Busca tickets que EU estou atendendo
            const meus = await db('chat_tickets')
                .where('status', 'ATENDIMENTO')
                .andWhere('atendente_id', usuarioId)
                .orderBy('atualizado_em', 'desc');

            res.render('pages/chat/index', {
                title: 'Atendimento WhatsApp',
                layout: 'layouts/main', // Seu layout padrão
                user: req.session.user,
                fila: fila,
                meus: meus
            });

        } catch (error) {
            console.error(error);
            res.redirect('/');
        }
    },

    listarMensagens: async (req, res) => {
        try {
            const { ticketId } = req.params;
            const msgs = await db('chat_mensagens')
                .where('ticket_id', ticketId)
                .orderBy('criado_em', 'asc');
            
            res.json(msgs);
        } catch (error) {
            res.status(500).json({ error: 'Erro ao buscar mensagens' });
        }
    }
};