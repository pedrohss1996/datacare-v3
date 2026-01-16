// src/routes/admin_chat.routes.js
const express = require('express');
const router = express.Router();

// 1. Importa sua conexão Knex (Caminho corrigido)
const db = require('../infra/database/connection'); 

router.get('/admin_chat', async (req, res) => {
    try {
        // SQL Otimizado (com aliases para não confundir IDs)
        const query = `
            SELECT
                cm.id AS mensagem_id,
                cm.ticket_id,
                cm.remetente,
                cm.tipo,
                cm.conteudo,
                cm.criado_em AS msg_data,
                
                ct.id AS ticket_real_id,
                ct.numero_whatsapp,
                ct.nome_contato,
                ct.foto_perfil,
                ct.status,
                ct.atendente_id,
                ct.ultima_mensagem,
                ct.nao_lidas,
                ct.criado_em AS ticket_inicio,
                ct.atualizado_em,
                ct.finalizado_em
            FROM
                chat_mensagens cm
            JOIN chat_tickets ct ON cm.ticket_id = ct.id
            ORDER BY 
                cm.ticket_id DESC, cm.criado_em ASC
        `;

        // 2. Executa usando Knex (.raw para SQL puro)
        const resultado = await db.raw(query);
        
        // 3. Extrai as linhas (No Knex+Postgres, os dados ficam em .rows)
        const dadosFormatados = resultado.rows;

        res.render('pages/admin_chat/index', {
            title: 'Dashboard de Atendimento',
            layout: 'layouts/main',
            user: req.user || null,
            dados: dadosFormatados,
            hideFooter: true
        });

    } catch (error) {
        console.error('ERRO DATABASE:', error);
        res.render('pages/admin_chat/index', {
            title: 'Erro ao carregar',
            layout: 'layouts/main',
            user: req.user || null,
            dados: []
        });
    }
});

module.exports = router;