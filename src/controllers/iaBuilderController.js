// src/controllers/iaBuilderController.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// Carregamento resiliente do banco
let db;
try {
    db = require('../infra/database/connection');
} catch (e) {
    try { db = require('../database/connection'); } catch (e2) { console.error("Erro DB", e); }
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = {

    // 1. CARREGA A TELA COM A LISTA DE QUERIES NO DROPDOWN
    index: async (req, res) => {
        try {
            // Buscamos apenas ID e Título para preencher o select
            const queriesDisponiveis = await db('gerenciador_queries')
                .select('id', 'titulo')
                .orderBy('titulo', 'asc');

            res.render('pages/ia-builder/index', {
                title: 'IA Page Builder',
                layout: 'layouts/main',
                user: req.user,
                datasets: queriesDisponiveis // <--- Enviamos para a View
            });
        } catch (error) {
            console.error(error);
            res.redirect('/');
        }
    },

    // 2. GERA O INDICADOR (COM FILTRO DE QUERY)
    gerar: async (req, res) => {
        const { promptUsuario, queryId } = req.body;

        try {
            // 1. LÓGICA DE FILTRAGEM (Mantém igual)
            let queryBuilder = db('gerenciador_queries').select('titulo', 'descricao', 'query_sql');
            if (queryId && queryId !== "") {
                queryBuilder.where('id', queryId);
            }
            const queriesDisponiveis = await queryBuilder;

            let schemaContext = "";
            if (queriesDisponiveis.length === 0) {
                schemaContext = "AVISO: Nenhuma fonte de dados encontrada. Tente inferir ou peça nomes reais.";
            } else {
                schemaContext = "VOCÊ TEM ACESSO AOS SEGUINTES DATASETS:\n\n";
                queriesDisponiveis.forEach(q => {
                    schemaContext += `--- DATASET: "${q.titulo}" ---\n`;
                    schemaContext += `DESCRIÇÃO: ${q.descricao || 'Sem descrição'}\n`;
                    schemaContext += `SQL BASE: \n${q.query_sql}\n\n`;
                });
            }

            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            const promptFinal = `
                ${schemaContext}
                PEDIDO DO USUÁRIO: "${promptUsuario}"
                
                ${queryId ? "NOTA: O usuário selecionou explicitamente o dataset acima. Use-o obrigatoriamente." : ""}

                VOCÊ É UM ENGENHEIRO DE DADOS ORACLE SÊNIOR.
                
                CRÍTICO - ANÁLISE DE COLUNAS:
                1. Se o SQL BASE tiver "SELECT *", assuma nomes padrões (CD_STATUS, DS_NOME) ou avise.
                2. Se tiver colunas explícitas, USE EXATAMENTE ELAS.

                REGRAS DE ORACLE (ANTI-ERRO):
                - JAMAIS use "CAST(x AS VARCHAR)". Use "TO_CHAR(x)".
                - Para nulos: "NVL(coluna, 'Valor')".
                - NÃO coloque ponto e vírgula ";" no final.

                JSON ESPERADO (PURO):
                {
                    "sql": "WITH dataset_selecionado AS (...SQL BASE...) SELECT ...",
                    "layout": { "tituloPagina": "...", "tituloKpi": "...", "tipoGrafico": "bar", "filtrosSugeridos": [] }
                }
            `;

            const result = await model.generateContent(promptFinal);
            const response = await result.response;
            let text = response.text();

            console.log("IA Respondeu (Bruto):", text); // Debug essencial

            // --- NOVA LÓGICA DE LIMPEZA INTELIGENTE ---
            // 1. Remove Markdown básico
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();

            // 2. Extrai apenas o PRIMEIRO objeto JSON válido (Contagem de Chaves)
            const firstBrace = text.indexOf('{');
            if (firstBrace !== -1) {
                let balance = 0;
                let endIndex = -1;
                // Percorre o texto a partir da primeira chave
                for (let i = firstBrace; i < text.length; i++) {
                    if (text[i] === '{') balance++;
                    else if (text[i] === '}') balance--;

                    // Se o saldo voltar a zero, encontramos o fechamento do objeto principal
                    if (balance === 0) {
                        endIndex = i;
                        break;
                    }
                }

                if (endIndex !== -1) {
                    text = text.substring(firstBrace, endIndex + 1);
                }
            }
            // -------------------------------------------

            const jsonFinal = JSON.parse(text);

            return res.json({ success: true, data: jsonFinal });

        } catch (erro) {
            console.error('Erro IA Detalhado:', erro);
            // Retorna o erro no JSON para você ver no console do navegador tbm
            return res.status(500).json({ success: false, error: 'Erro ao processar IA: ' + erro.message });
        }
    },

    testar: async (req, res) => {
        // ... (MANTÉM IGUAL AO QUE JÁ FUNCIONA) ...
        const { sql } = req.body;
        try {
            if (!db.oracle) return res.status(500).json({ error: 'Erro conexão Oracle' });
            const resultados = await db.oracle.raw(sql);
            return res.json({ success: true, dados: resultados });
        } catch (erro) {
            return res.status(500).json({ success: false, error: erro.message });
        }
    }
};