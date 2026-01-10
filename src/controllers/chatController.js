const db = require('../infra/database/connection');
const axios = require('axios');

// Configuração da Z-API (Idealmente, mova para .env)
const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE_ID || 'SEU_INSTANCE_ID';
const ZAPI_TOKEN = process.env.ZAPI_TOKEN || 'SEU_TOKEN';
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || 'SEU_CLIENT_TOKEN';
const ZAPI_URL = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`;

module.exports = {

    // =================================================================
    // 1. VISUALIZAÇÃO (RENDER)
    // =================================================================

    index: async (req, res) => {
        try {
            const usuarioId = req.session.user.id; 

            // Tickets aguardando na fila
            const fila = await db('chat_tickets')
                .where('status', 'FILA')
                .orderBy('criado_em', 'asc');

            // Tickets em atendimento pelo usuário
            const meus = await db('chat_tickets')
                .where('status', 'ATENDIMENTO')
                .andWhere('atendente_id', usuarioId)
                .orderBy('atualizado_em', 'desc');

            res.render('pages/chat/index', {
                title: 'Atendimento DataCare',
                layout: 'layouts/main',
                user: req.session.user,
                fila: fila || [],
                meus: meus || []
            });

        } catch (error) {
            console.error("Erro Render Chat:", error);
            // Renderiza vazio para não quebrar a aplicação
            res.render('pages/chat/index', { user: req.session.user, fila: [], meus: [] });
        }
    },

    // =================================================================
    // 2. API INTERNA (AÇÕES DO ATENDENTE)
    // =================================================================

    listarMensagens: async (req, res) => {
        try {
            const { ticketId } = req.params;
            const msgs = await db('chat_mensagens')
                .where('ticket_id', ticketId)
                .orderBy('criado_em', 'asc');
            
            res.json(msgs);
        } catch (error) {
            res.status(500).json({ error: 'Erro ao buscar histórico.' });
        }
    },

    // Ação Atômica: Puxar ticket da fila para mim
    assumir: async (req, res) => {
        const { ticketId } = req.body;
        const usuarioId = req.session.user.id;
        const nomeAtendente = req.session.user.nome;

        const trx = await db.transaction();

        try {
            // 1. Tenta atualizar e travar o registro
            const [ticketAtualizado] = await trx('chat_tickets')
                .where({ id: ticketId, status: 'FILA' }) // Trava de segurança
                .update({
                    atendente_id: usuarioId,
                    status: 'ATENDIMENTO',
                    atualizado_em: new Date()
                })
                .returning('*');

            if (!ticketAtualizado) {
                await trx.rollback();
                return res.status(400).json({ error: 'Ticket já assumido por outro ou inexistente.' });
            }

            // 2. Log de Sistema
            await trx('chat_mensagens').insert({
                ticket_id: ticketId,
                remetente: 'SISTEMA',
                tipo: 'texto',
                conteudo: `👨‍⚕️ ${nomeAtendente} iniciou o atendimento.`,
                criado_em: new Date()
            });

            await trx.commit();

            // 3. Notificação Real-time (Socket)
            const payload = {
                ticketId: ticketAtualizado.id,
                atendenteId: usuarioId,
                nomeAtendente: nomeAtendente,
                nomePaciente: ticketAtualizado.nome_contato || ticketAtualizado.numero_whatsapp
            };

            // Avisa TODOS (remove da fila de todos)
            req.io.emit('ticket_assumido_fila', payload);

            res.json({ success: true, ticket: ticketAtualizado });

        } catch (error) {
            await trx.rollback();
            console.error("Erro ao assumir:", error);
            res.status(500).json({ error: 'Erro interno.' });
        }
    },

    transferir: async (req, res) => {
        const { ticketId, novoAtendenteId, motivo } = req.body;
        const usuarioLogado = req.session.user;
        const trx = await db.transaction();

        try {
            const novoAtendente = await trx('usuarios').where({ id: novoAtendenteId }).first();
            const nomeDestino = novoAtendente ? novoAtendente.nome : 'Outro Atendente';

            await trx('chat_tickets')
                .where({ id: ticketId })
                .update({
                    atendente_id: novoAtendenteId,
                    status: 'ATENDIMENTO',
                    atualizado_em: new Date()
                });

            await trx('chat_mensagens').insert({
                ticket_id: ticketId,
                remetente: 'SISTEMA',
                conteudo: `🛑 𝗧𝗥𝗔𝗡𝗦𝗕𝗢𝗥𝗗𝗢: De *${usuarioLogado.nome}* para *${nomeDestino}*.\n📝 *Nota:* ${motivo || '-'}`,
                criado_em: new Date()
            });

            await trx.commit();
            
            // TODO: Emitir socket para o novo atendente saber que recebeu um ticket
            // req.io.to(`user_${novoAtendenteId}`).emit('ticket_recebido', ...);

            res.json({ success: true });

        } catch (error) {
            await trx.rollback();
            console.error("Erro Transbordo:", error);
            res.status(500).json({ error: 'Falha na transferência.' });
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

            // Avisa o front para fechar a aba se estiver aberta
            req.io.to(ticketId.toString()).emit('ticket_finalizado');

            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: 'Erro ao finalizar.' });
        }
    },

    // =================================================================
    // 3. INTEGRAÇÃO Z-API (OUTBOUND & INBOUND)
    // =================================================================

    // Enviar Mensagem (App -> WhatsApp)
    enviar: async (req, res) => {
        const { ticketId, conteudo, tipo = 'texto' } = req.body;
        
        try {
            const ticket = await db('chat_tickets').where('id', ticketId).first();
            if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });

            // 1. Salva no Banco
            const [novaMsg] = await db('chat_mensagens')
                .insert({
                    ticket_id: ticketId,
                    remetente: 'ATENDENTE',
                    tipo: tipo,
                    conteudo: conteudo,
                    criado_em: new Date()
                })
                .returning('*');

            // 2. Atualiza Ticket
            await db('chat_tickets').where('id', ticketId).update({
                ultima_mensagem: conteudo,
                atualizado_em: new Date()
            });

            // 3. Dispara Z-API (COM O HEADER OBRIGATÓRIO)
            try {
                let numeroLimpo = ticket.numero_whatsapp.replace(/\D/g, ''); 
                
                console.log(`🚀 Enviando com Client-Token Header...`);
                
                // --- AQUI ESTÁ A CORREÇÃO DO NOT ALLOWED ---
                const response = await axios.post(
                    `${ZAPI_URL}/send-text`, 
                    {
                        phone: numeroLimpo,
                        message: conteudo
                    },
                    {
                        headers: {
                            // É obrigatório enviar isso quando a segurança extra está ativa!
                            'Client-Token': ZAPI_CLIENT_TOKEN 
                        }
                    }
                );
                // -------------------------------------------

                console.log("✅ Sucesso Z-API! ID:", response.data.messageId);

            } catch (apiError) {
                console.error("❌ ERRO Z-API:");
                if (apiError.response) {
                    console.error("Status:", apiError.response.status);
                    console.error("Erro:", JSON.stringify(apiError.response.data));
                } else {
                    console.error("Mensagem:", apiError.message);
                }
            }

            // 4. Emite Socket
            req.io.to(ticketId.toString()).emit('nova_mensagem', novaMsg);

            res.json({ success: true, data: novaMsg });

        } catch (error) {
            console.error("Erro Geral:", error);
            res.status(500).json({ error: 'Falha interna.' });
        }
    },


    // Webhook (WhatsApp -> App)
    webhook: async (req, res) => {
        try {
            // Log para debug (pode manter ou comentar depois)
            // console.log("📥 Z-API WEBHOOK:", JSON.stringify(req.body, null, 2));

            // 1. Extrai os dados DIRETO da raiz (baseado no seu log)
            const { type, phone, isGroup, text, senderName } = req.body;

            // 2. FILTRO: Ignora se não for recebimento ou se for grupo
            // O seu segundo log era 'MessageStatusCallback' (confirmação de leitura), por isso ignoramos aqui
            if (type !== 'ReceivedCallback' || isGroup) {
                // console.log("Ignorado: Não é mensagem de recebimento.");
                return res.status(200).send('Ignorado'); 
            }

            // 3. EXTRAÇÃO SEGURA DO TEXTO
            // A Z-API mandou: "text": { "message": "Marcar exame" }
            const textoMensagem = (text && text.message) ? text.message : null;

            if (!textoMensagem) {
                console.log("Ignorado: Mensagem sem conteúdo de texto (pode ser imagem/áudio).");
                return res.status(200).send('Ignorado');
            }

            // 4. Mapeamento das variáveis para o banco
            const numeroCliente = phone; 
            const nomeContato = senderName || numeroCliente; // Pega o nome do perfil ou usa o número

            console.log(`💬 Processando mensagem de ${nomeContato}: "${textoMensagem}"`);

            // --- DAQUI PARA BAIXO A LÓGICA PERMANECE A MESMA ---

            // 1. Busca Ticket Ativo
            let ticket = await db('chat_tickets')
                .where('numero_whatsapp', numeroCliente)
                .whereIn('status', ['FILA', 'ATENDIMENTO'])
                .first();

            let ehNovoTicket = false;

            // 2. Cria Ticket se não existir
            if (!ticket) {
                const [novoId] = await db('chat_tickets').insert({
                    numero_whatsapp: numeroCliente,
                    nome_contato: nomeContato,
                    status: 'FILA',
                    ultima_mensagem: textoMensagem,
                    nao_lidas: 1,
                    criado_em: new Date(),
                    atualizado_em: new Date()
                }).returning('id');
                
                // Tratamento de ID (Postgres retorna objeto, outros array/int)
                const idFinal = novoId.id || novoId;
                
                ticket = await db('chat_tickets').where('id', idFinal).first();
                ehNovoTicket = true;
            } else {
                // Atualiza existente
                await db('chat_tickets').where('id', ticket.id).update({
                    ultima_mensagem: textoMensagem,
                    nao_lidas: ticket.nao_lidas + 1,
                    atualizado_em: new Date()
                });
            }

            // 3. Salva Mensagem
            const [msgDb] = await db('chat_mensagens').insert({
                ticket_id: ticket.id,
                remetente: 'PACIENTE',
                tipo: 'texto',
                conteudo: textoMensagem,
                criado_em: new Date()
            }).returning('*');

            // 4. Socket: Atualiza telas
            if (ehNovoTicket) {
                req.io.emit('novo_ticket_fila', ticket);
            } else {
                req.io.to(ticket.id.toString()).emit('nova_mensagem', msgDb);
            }

            res.status(200).send('Recebido');

        } catch (error) {
            console.error("❌ Erro Crítico no Webhook:", error);
            res.status(200).send('Erro processado'); 
        }
    },


    // Função auxiliar para testes manuais (cria ticket fake)
    simularEntradaPaciente: async (req, res) => {
        const { numero, nome, mensagem } = req.body;
        try {
            // Reutiliza lógica parecida com o webhook, mas forçada
            const [novoTicket] = await db('chat_tickets').insert({
                numero_whatsapp: numero,
                nome_contato: nome,
                status: 'FILA',
                ultima_mensagem: mensagem,
                nao_lidas: 1,
                criado_em: new Date(),
                atualizado_em: new Date()
            }).returning('*');

            await db('chat_mensagens').insert({
                ticket_id: novoTicket.id,
                remetente: 'PACIENTE',
                tipo: 'texto',
                conteudo: mensagem,
                criado_em: new Date()
            });

            req.io.emit('novo_ticket_fila', novoTicket);
            res.json({ success: true, ticket: novoTicket });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
};