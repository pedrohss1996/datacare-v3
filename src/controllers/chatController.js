const db = require('../infra/database/connection');
const axios = require('axios');

// Configuração da Z-API
const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE_ID || 'SEU_INSTANCE_ID';
const ZAPI_TOKEN = process.env.ZAPI_TOKEN || 'SEU_TOKEN';
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN || 'SEU_CLIENT_TOKEN';
const ZAPI_URL = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`;
const { baixarMidia } = require('../utils/mediaHandler'); // <--- IMPORTANTE

// =================================================================
// 🧠 HELPER: NORMALIZAÇÃO DE TELEFONE (A MÁGICA DO 9º DÍGITO)
// =================================================================
// Helper Normalização (Mantido)
function normalizarTelefone(phone) {
    let cleanPhone = phone.toString().replace(/\D/g, '');
    if (!cleanPhone.startsWith('55') && cleanPhone.length <= 11) {
        cleanPhone = '55' + cleanPhone;
    }
    if (cleanPhone.length === 12) {
        const ddd = cleanPhone.substring(2, 4);
        const numberPart = cleanPhone.substring(4);
        const firstDigit = parseInt(numberPart[0]);
        if (firstDigit >= 6) {
            return `${cleanPhone.substring(0, 4)}9${numberPart}`;
        }
    }
    return cleanPhone;
}

module.exports = {

    // =================================================================
    // 1. VISUALIZAÇÃO (RENDER)
    // =================================================================

    index: async (req, res) => {
        try {
            const usuarioId = req.session.user.id; 

            const fila = await db('chat_tickets')
                .where('status', 'FILA')
                .orderBy('criado_em', 'asc');

            const meus = await db('chat_tickets')
                .where('status', 'ATENDIMENTO')
                .andWhere('atendente_id', usuarioId)
                .orderBy('atualizado_em', 'desc');

            res.render('pages/chat/index', {
                title: 'Atendimento DataCare',
                layout: 'layouts/main',
                user: req.session.user,
                fila: fila || [],
                meus: meus || [],
                hideFooter: true
            });

        } catch (error) {
            console.error("Erro Render Chat:", error);
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

    assumir: async (req, res) => {
        const { ticketId } = req.body;
        const usuarioId = req.session.user.id;
        const nomeAtendente = req.session.user.nome;

        const trx = await db.transaction();

        try {
            const [ticketAtualizado] = await trx('chat_tickets')
                .where({ id: ticketId, status: 'FILA' })
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

            await trx('chat_mensagens').insert({
                ticket_id: ticketId,
                remetente: 'SISTEMA',
                tipo: 'texto',
                conteudo: `👨‍⚕️ ${nomeAtendente} iniciou o atendimento.`,
                criado_em: new Date()
            });

            await trx.commit();

            const payload = {
                ticketId: ticketAtualizado.id,
                atendenteId: usuarioId,
                nomeAtendente: nomeAtendente,
                nomePaciente: ticketAtualizado.nome_contato || ticketAtualizado.numero_whatsapp
            };

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

            req.io.to(ticketId.toString()).emit('ticket_finalizado');
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: 'Erro ao finalizar.' });
        }
    },

    // =================================================================
    // 3. INTEGRAÇÃO Z-API (OUTBOUND & INBOUND)
    // =================================================================

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

            // 3. Dispara Z-API
            try {
                // Aqui podemos usar o número do banco, pois já deve estar normalizado
                // Mas por segurança, removemos símbolos
                let numeroEnvio = ticket.numero_whatsapp.replace(/\D/g, ''); 
                
                const response = await axios.post(
                    `${ZAPI_URL}/send-text`, 
                    {
                        phone: numeroEnvio,
                        message: conteudo
                    },
                    {
                        headers: {
                            'Client-Token': ZAPI_CLIENT_TOKEN 
                        }
                    }
                );
                
                console.log("✅ MSG Enviada. ID:", response.data.messageId);

            } catch (apiError) {
                console.error("❌ ERRO Z-API Envio:", apiError.message);
            }

            // 4. Emite Socket
            req.io.to(ticketId.toString()).emit('nova_mensagem', novaMsg);

            res.json({ success: true, data: novaMsg });

        } catch (error) {
            console.error("Erro Geral Enviar:", error);
            res.status(500).json({ error: 'Falha interna.' });
        }
    },

    // =================================================================
    // 🪝 WEBHOOK: VERSÃO CAÇADORA DE TICKETS (CORRIGIDA)
    // =================================================================


    webhook: async (req, res) => {
        try {
            const body = req.body;
            
            // 1. IGNORAR STATUS DE LEITURA E ENTREGAS (O segundo log que você mandou)
            // Se for MessageStatusCallback ou DeliveryCallback, a gente ignora.
            if (body.type === 'MessageStatusCallback' || body.type === 'DeliveryCallback') {
                return res.status(200).send('Status Ignorado');
            }

            // 2. Extração de Dados
            const { isGroup, phone, senderName } = body;
            
            if (isGroup) return res.status(200).send('Ignorado (Grupo)');

            // Definição do Conteúdo e Tipo Interno
            let textoMensagem = '';
            let tipoInterno = 'texto';
            let urlMidiaParaBaixar = null;
            let tipoZapi = 'text'; // Para passar pro downloader

            // -------------------------------------------------------------
            // 🕵️‍♂️ DETECÇÃO ROBUSTA DE TIPO (CORRIGIDA)
            // -------------------------------------------------------------
            
            // Se tiver objeto 'text'
            if (body.text) {
                tipoInterno = 'texto';
                textoMensagem = body.text.message || '';
            } 
            // Se tiver objeto 'image' (AQUI ESTAVA O PULO DO GATO)
            else if (body.image) {
                tipoInterno = 'imagem';
                tipoZapi = 'image';
                textoMensagem = body.image.caption || '📷 [Imagem]'; 
                urlMidiaParaBaixar = body.image.imageUrl;
            }
            // Se tiver objeto 'audio'
            else if (body.audio) {
                tipoInterno = 'audio';
                tipoZapi = 'audio';
                textoMensagem = '🎤 [Áudio]';
                urlMidiaParaBaixar = body.audio.audioUrl;
            }
            // Se tiver objeto 'document'
            else if (body.document) {
                tipoInterno = 'arquivo';
                tipoZapi = 'document';
                textoMensagem = body.document.caption || '📄 [Documento]';
                urlMidiaParaBaixar = body.document.documentUrl;
            }
            else {
                // Se não for nenhum dos acima, ignora
                console.log("Tipo desconhecido ou não tratado:", body.type);
                return res.status(200).send('Ignorado');
            }

            // -------------------------------------------------------------
            // LÓGICA DE DOWNLOAD (Se for mídia)
            // -------------------------------------------------------------
            let conteudoFinal = textoMensagem;
            
            if (urlMidiaParaBaixar) {
                console.log(`📥 Baixando mídia (${tipoInterno}). URL: ${urlMidiaParaBaixar}`);
                
                // Chama nossa função utilitária
                const caminhoLocal = await baixarMidia(urlMidiaParaBaixar, tipoZapi);
                
                if (caminhoLocal) {
                    conteudoFinal = caminhoLocal; // Salva /uploads/xxxx.jpg no banco
                } else {
                    conteudoFinal = "❌ Erro ao baixar mídia.";
                    tipoInterno = 'texto'; 
                }
            }

            // -------------------------------------------------------------
            // O RESTO CONTINUA IGUAL (Busca de Ticket, Save no Banco, etc)
            // -------------------------------------------------------------
            const raw = phone.toString().replace(/\D/g, ''); 
            const normalized = normalizarTelefone(raw);      
            const withoutDDI = normalized.replace(/^55/, ''); 
            const possiveisNumeros = [...new Set([raw, normalized, withoutDDI])]; 

            let ticket = await db('chat_tickets')
                .whereIn('numero_whatsapp', possiveisNumeros)
                .whereIn('status', ['FILA', 'ATENDIMENTO'])
                .first();

            const trx = await db.transaction();

            try {
                let ehNovoTicket = false;

                if (!ticket) {
                    const [novoId] = await trx('chat_tickets').insert({
                        numero_whatsapp: normalized,
                        nome_contato: senderName || normalized,
                        status: 'FILA',
                        ultima_mensagem: tipoInterno === 'texto' ? textoMensagem : `[${tipoInterno.toUpperCase()}]`,
                        nao_lidas: 1,
                        criado_em: new Date(),
                        atualizado_em: new Date()
                    }).returning('id');
                    
                    const idFinal = novoId.id || novoId;
                    ticket = await trx('chat_tickets').where('id', idFinal).first();
                    ehNovoTicket = true;
                } else {
                    await trx('chat_tickets').where('id', ticket.id).update({
                        ultima_mensagem: tipoInterno === 'texto' ? textoMensagem : `[${tipoInterno.toUpperCase()}]`,
                        nao_lidas: ticket.nao_lidas + 1,
                        atualizado_em: new Date()
                    });
                }

                const [msgDb] = await trx('chat_mensagens').insert({
                    ticket_id: ticket.id,
                    remetente: 'PACIENTE',
                    tipo: tipoInterno,
                    conteudo: conteudoFinal,
                    criado_em: new Date()
                }).returning('*');

                await trx.commit();

                // SOCKETS
                const payloadSocket = { ...msgDb };
                
                if (ehNovoTicket) {
                    req.io.emit('novo_ticket_fila', ticket);
                } else {
                    if (ticket.status === 'ATENDIMENTO') {
                        req.io.to(ticket.id.toString()).emit('nova_mensagem', payloadSocket);
                        req.io.emit('atualizar_lista_meus', {
                            ticketId: ticket.id,
                            msg: tipoInterno === 'texto' ? textoMensagem : `📎 ${tipoInterno}`,
                            nao_lidas: ticket.nao_lidas + 1
                        });
                    } else {
                        req.io.emit('novo_ticket_fila', ticket);
                    }
                }

                res.status(200).send('Recebido Mídia');

            } catch (errorTrx) {
                await trx.rollback();
                console.error("Erro Transação Webhook:", errorTrx);
                throw errorTrx;
            }

        } catch (error) {
            console.error("❌ Erro Geral Webhook:", error);
            res.status(200).send('Erro processado');
        }
    },


    // =================================================================
    // 📞 INICIAR CONTATO ATIVO (ATUALIZADO)
    // =================================================================
    iniciarAtendimento: async (req, res) => {
        const { telefone, nome, mensagem } = req.body;
        const usuarioId = req.session.user.id; 

        if (!telefone || !mensagem) return res.status(400).json({ error: 'Dados incompletos.' });

        try {
            // ✅ CORREÇÃO: Usa a função INTELIGENTE
            const zap = normalizarTelefone(telefone);
            
            console.log(`📞 Iniciando Ativo para: ${zap} (Original: ${telefone})`);

            // Busca usando a versão corrigida
            let ticket = await db('chat_tickets').where('numero_whatsapp', zap).first();
            
            const trx = await db.transaction();
            try {
                if (!ticket) {
                    const [novoId] = await trx('chat_tickets').insert({
                        numero_whatsapp: zap,
                        nome_contato: nome || zap,
                        status: 'ATENDIMENTO',
                        atendente_id: usuarioId,
                        ultima_mensagem: mensagem,
                        nao_lidas: 0,
                        criado_em: new Date(),
                        atualizado_em: new Date()
                    }).returning('id');
                    const idFinal = novoId.id || novoId;
                    ticket = await trx('chat_tickets').where('id', idFinal).first();
                } else {
                    await trx('chat_tickets').where('id', ticket.id).update({
                        atendente_id: usuarioId,
                        status: 'ATENDIMENTO',
                        ultima_mensagem: mensagem,
                        atualizado_em: new Date()
                    });
                    ticket = await trx('chat_tickets').where('id', ticket.id).first();
                }

                const [novaMsg] = await trx('chat_mensagens').insert({
                    ticket_id: ticket.id,
                    remetente: 'ATENDENTE',
                    tipo: 'texto',
                    conteudo: mensagem,
                    criado_em: new Date()
                }).returning('*');

                await trx.commit();

                // Envia Z-API
                try {
                    await axios.post(`${ZAPI_URL}/send-text`, 
                        { phone: zap, message: mensagem },
                        { headers: { 'Client-Token': ZAPI_CLIENT_TOKEN } }
                    );
                } catch (zapiErr) { console.error("Erro Z-API", zapiErr.message); }

                req.io.emit('ticket_assumido_fila', { 
                    ticketId: ticket.id, 
                    atendenteId: usuarioId,
                    nomePaciente: ticket.nome_contato, 
                    ultima_mensagem: mensagem
                });
                req.io.to(ticket.id.toString()).emit('nova_mensagem', novaMsg);

                res.json({ success: true, ticket });
            } catch (errTrx) { await trx.rollback(); throw errTrx; }
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Erro ao iniciar.' });
        }
    },
    
    // Simulação mantida para testes
    simularEntradaPaciente: async (req, res) => {
        const { numero, nome, mensagem } = req.body;
        try {
            const zap = normalizarTelefone(numero); // Também normaliza aqui para testar igual produção

            const [novoTicket] = await db('chat_tickets').insert({
                numero_whatsapp: zap,
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