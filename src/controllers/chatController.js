const db = require('../infra/database/connection');

module.exports = {
    index: async (req, res) => {
        try {
            const usuarioId = req.session.user.id; 

            // 1. Busca tickets da FILA
            const fila = await db('chat_tickets')
                .where('status', 'FILA')
                .orderBy('criado_em', 'asc');

            // 2. Busca MEUS tickets
            const meus = await db('chat_tickets')
                .where('status', 'ATENDIMENTO')
                .andWhere('atendente_id', usuarioId)
                .orderBy('atualizado_em', 'desc');

            res.render('pages/chat/index', {
                title: 'Atendimento DataCare',
                layout: 'layouts/main',
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

    // --- NOVA FUNÇÃO: TRANSFERÊNCIA (TRANSBORDO) ---
    transferir: async (req, res) => {
        const { ticketId, novoAtendenteId, motivo } = req.body;
        const usuarioLogado = req.session.user; // Quem está transferindo

        // Inicia uma transação para garantir integridade
        const trx = await db.transaction();

        try {
            // 1. Busca nome do novo atendente para o log (opcional, mas fica bonito)
            const novoAtendente = await trx('usuarios')
                .select('nome')
                .where({ id: novoAtendenteId })
                .first();
            
            const nomeDestino = novoAtendente ? novoAtendente.nome : 'Outro Atendente';

            // 2. Atualiza o Ticket (Troca o Dono)
            await trx('chat_tickets')
                .where({ id: ticketId })
                .update({
                    atendente_id: novoAtendenteId,
                    status: 'ATENDIMENTO', // Garante que continua em atendimento
                    atualizado_em: new Date()
                });

            // 3. Insere Mensagem de Sistema (Auditoria do Transbordo)
            await trx('chat_mensagens').insert({
                ticket_id: ticketId,
                remetente: 'SISTEMA', // Importante para o front pintar diferente
                conteudo: `🛑 𝗧𝗥𝗔𝗡𝗦𝗕𝗢𝗥𝗗𝗢: Atendimento transferido de *${usuarioLogado.nome}* para *${nomeDestino}*.\n📝 *Nota:* ${motivo || 'Sem observações.'}`,
                criado_em: new Date()
            });

            await trx.commit(); // Confirma tudo

            // TODO: Aqui você emitiria o socket para avisar o novo atendente
            // req.io.to(`user_${novoAtendenteId}`).emit('ticket_recebido', { ... });

            res.json({ success: true });

        } catch (error) {
            await trx.rollback(); // Desfaz tudo se der erro
            console.error("Erro no Transbordo:", error);
            res.status(500).json({ error: 'Falha ao realizar transferência.' });
        }
    },

    finalizar: async (req, res) => {
        const { ticketId } = req.body;
        try {
            await db('chat_tickets')
                .where({ id: ticketId })
                .update({ 
                    status: 'FINALIZADO',
                    atualizado_em: new Date()
                });

            res.json({ success: true });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Erro ao finalizar' });
        }
    },

    assumirTicket: async (req, res) => {
        const { ticketId } = req.body;
        const usuarioId = req.session.user.id; // ID do atendente logado

        try {
            // 1. Otimização de Transição (Atomic Update)
            // Só faz o update se o status for 'FILA' e o atendente_id for nulo
            const rowsAffected = await db('chat_tickets')
                .where({ id: ticketId })
                .andWhere('status', 'FILA')
                .update({
                    atendente_id: usuarioId,
                    status: 'ATENDIMENTO',
                    atualizado_em: new Date()
                });

            const payload = {
                ticketId: ticketId,
                atendenteId: usuarioId,
                nomeAtendente: req.session.user.nome
            };

            // Emite para TODOS para que saia da fila de todo mundo
            req.io.emit('ticket_assumido_fila', payload);

            // 2. Verificação de Concorrência
            if (rowsAffected === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Este atendimento já foi assumido por outro colega ou não está mais na fila.' 
                });
            }

            // 3. Log de Auditoria na tabela CHAT_MENSAGENS
            // É importante registrar que o atendimento começou para o histórico do paciente
            await db('chat_mensagens').insert({
                ticket_id: ticketId,
                remetente: 'SISTEMA',
                tipo: 'texto',
                conteudo: `O atendente ${req.session.user.nome} assumiu o atendimento.`,
                criado_em: new Date()
            });

            // 4. Notifica via Socket que a fila diminuiu (Opcional mas recomendado)
            req.io.emit('ticket_puxado_da_fila', { ticketId, atendenteId: usuarioId });

            res.json({ success: true });

        } catch (error) {
            console.error("Erro ao assumir ticket no Postgres:", error);
            res.status(500).json({ error: 'Erro interno ao processar atendimento.' });
        }
    },

    simularEntradaPaciente: async (req, res) => {
    const { numero, nome, mensagem } = req.body;

        try {
            // 1. Insere na tabela CHAT_TICKETS (Usando o nome exato da sua tabela)
            // Definimos status como 'FILA' e deixamos atendente_id como NULL
            const [novoTicket] = await db('chat_tickets')
                .insert({
                    numero_whatsapp: numero,
                    nome_contato: nome,
                    status: 'FILA',
                    ultima_mensagem: mensagem,
                    nao_lidas: 1,
                    criado_em: new Date(),
                    atualizado_em: new Date()
                })
                .returning('*'); // Retorna o objeto inserido com o ID do Postgres

            // 2. Insere a primeira mensagem na CHAT_MENSAGENS
            await db('chat_mensagens').insert({
                ticket_id: novoTicket.id,
                remetente: 'PACIENTE',
                tipo: 'texto',
                conteudo: mensagem,
                criado_em: new Date()
            });

            // 3. ENVIAR PARA O FRONT-END (SOCKET.IO)
            // Aqui o 'io' que configuramos no server.js entra em ação
            req.io.emit('novo_ticket_fila', novoTicket);

            res.json({ success: true, ticket: novoTicket });

        } catch (error) {
            console.error("Erro na simulação:", error);
            res.status(500).json({ error: error.message });
        }
    },

    assumir: async (req, res) => {
        const { ticketId } = req.body;
        const usuarioId = req.session.user.id;

        try {
            const atualizado = await db('chat_tickets')
                .where({ id: ticketId, status: 'FILA' }) 
                .update({
                    atendente_id: usuarioId,
                    status: 'ATENDIMENTO',
                    atualizado_em: new Date()
                })
                .returning('*');

            if (atualizado.length === 0) {
                // Se cair aqui, o F5 resolveu, mas o Real-time falhou antes
                return res.status(400).json({ error: 'Ticket já assumido ou ID inválido.' });
            }

            // --- O SEGREDO ESTÁ AQUI ---
            const payload = {
                ticketId: ticketId,
                atendenteId: usuarioId,
                nomeAtendente: req.session.user.nome
            };

            // Envia para todos os sockets conectados
            req.io.emit('ticket_assumido_fila', payload);

            return res.json({ success: true, ticket: atualizado[0] });

        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Erro interno' });
        }
    },

    enviar: async (req, res) => {
        const { ticketId, conteudo, tipo = 'texto' } = req.body;
        const usuarioId = req.session.user.id;

        try {
            // 1. Insere a mensagem no Postgres
            const [novaMsg] = await db('chat_mensagens')
                .insert({
                    ticket_id: ticketId,
                    remetente: 'ATENDENTE',
                    tipo: tipo,
                    conteudo: conteudo,
                    criado_em: new Date()
                })
                .returning('*');

            // 2. Atualiza a "última mensagem" no ticket para manter a lista lateral atualizada
            await db('chat_tickets')
                .where({ id: ticketId })
                .update({
                    ultima_mensagem: conteudo,
                    atualizado_em: new Date()
                });

            // 3. EMITE VIA SOCKET (Para o próprio atendente e outros aparelhos conectados)
            // Usamos o ticketId como 'sala' para que a msg só apareça no chat certo
            req.io.to(ticketId.toString()).emit('nova_mensagem', novaMsg);

            // TODO: Chamar sua função da Z-API aqui no futuro para enviar ao celular do paciente

            res.json({ success: true, data: novaMsg });

        } catch (error) {
            console.error("Erro ao enviar mensagem:", error);
            res.status(500).json({ error: 'Falha ao enviar mensagem.' });
        }
    }


};