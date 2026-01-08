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
    },

    finalizar: async (req, res) => {
        const { ticketId } = req.body;
        try {
            // 1. Atualiza status no banco
            await db('chat_tickets')
                .where({ id: ticketId })
                .update({ 
                    status: 'FINALIZADO',
                    atualizado_em: new Date()
                    // aqui poderia ter: finalizado_em: new Date()
                });

            // 2. Avisa front (opcional, se quiser remover da tela dos outros em tempo real)
            // req.io.emit('ticket_finalizado', { ticketId });

            res.json({ success: true });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Erro ao finalizar' });
        }
    }
};
