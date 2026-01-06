// src/controllers/iaBuilderController.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// Carregamento resiliente do Banco
let db;
try {
    db = require('../infra/database/connection');
} catch (e) {
    try { db = require('../database/connection'); } catch (e2) { console.error("Erro DB", e); }
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const STYLE_GUIDE = `
ESTILO VISUAL (BOOTSTRAP 5):
- Framework: Bootstrap 5.3 (CDN) + FontAwesome 6 (CDN).
- Layout: Container fluido, Cards (.card), Gráficos (Chart.js).
- Cores: Use classes bootstrap (bg-primary, text-success, etc).
- IMPORTANTE: O script JS deve ler 'window.DADOS_DB' (array de objetos) para montar a tela.
`;

module.exports = {

    index: async (req, res) => {
        try {
            const queries = await db('gerenciador_queries').select('id', 'titulo').orderBy('titulo', 'asc');
            res.render('pages/ia-builder/index', {
                title: 'IA Page Builder',
                layout: 'layouts/main',
                user: req.user,
                datasets: queries
            });
        } catch (error) { res.redirect('/'); }
    },

    gerar: async (req, res) => {
        const { promptUsuario, queryId } = req.body;

        try {
            // 1. Busca Contexto
            let queryBuilder = db('gerenciador_queries').select('titulo', 'descricao', 'query_sql');
            if (queryId) queryBuilder.where('id', queryId);
            const queriesDisponiveis = await queryBuilder;

            let schemaContext = "";
            if (queriesDisponiveis.length === 0) {
                schemaContext = "AVISO: Sem datasets. Tente inferir SQL genérico.";
            } else {
                schemaContext = "DATASETS DISPONÍVEIS:\n";
                queriesDisponiveis.forEach(q => {
                    schemaContext += `DATASET: "${q.titulo}"\nDESC: ${q.descricao}\nSQL BASE: ${q.query_sql}\n---\n`;
                });
            }

            // 2. Modelo Universal (gemini-pro)
            const model = genAI.getGenerativeModel({ model: "gemini-pro-latest" });

            // 3. O PULO DO GATO: NÃO PEDIMOS MAIS JSON
            // Pedimos blocos de texto delimitados por tags únicas.
            const promptFinal = `
                ${schemaContext}
                ${STYLE_GUIDE}
                
                PEDIDO DO USUÁRIO: "${promptUsuario}"
                ${queryId ? "NOTA: Use o dataset selecionado obrigatoriamente." : ""}

                VOCÊ É UM DESENVOLVEDOR FULLSTACK.
                Gere dois blocos de código separados:
                
                1. SQL ORACLE:
                   - Use CTE (WITH dataset AS...) baseada no dataset escolhido.
                   - Use TO_CHAR para formatar datas se necessário.
                
                2. HTML5 COMPLETO:
                   - Single Page Application.
                   - Deve conter <script> que pega 'window.DADOS_DB' e monta gráficos/tabelas.
                   - Use Bootstrap 5 e Chart.js.

                3. GERACAO DE PAGINAS:
                    - Qualquer ajuste solicitado não deve refazer a pagina, a pagina ela vai ser construida somente uma unica vez e você só vai aplicar as mudanças solicitadas

                FORMATO DE RESPOSTA OBRIGATÓRIO (TXT):
                
                [[SQL_START]]
                ...escreva o sql aqui...
                [[SQL_END]]

                [[HTML_START]]
                <!DOCTYPE html>
                ...escreva o html aqui...
                [[HTML_END]]
            `;

            console.log("Enviando prompt (Modo Blocos)...");
            const result = await model.generateContent(promptFinal);
            const response = await result.response;
            const text = response.text();

            // 4. PARSER MANUAL (EXTRAÇÃO VIA REGEX)
            // Isso evita erro de JSON inválido com aspas
            const sqlMatch = text.match(/\[\[SQL_START\]\]([\s\S]*?)\[\[SQL_END\]\]/);
            const htmlMatch = text.match(/\[\[HTML_START\]\]([\s\S]*?)\[\[HTML_END\]\]/);

            if (!sqlMatch || !htmlMatch) {
                throw new Error("A IA não retornou os blocos no formato correto. Tente novamente.");
            }

            const sqlExtraido = sqlMatch[1].trim();
            const htmlExtraido = htmlMatch[1].trim();

            return res.json({ 
                success: true, 
                data: { 
                    sql: sqlExtraido, 
                    html: htmlExtraido 
                } 
            });

        } catch (erro) {
            console.error('Erro IA:', erro);
            return res.status(500).json({ success: false, error: 'Erro ao processar: ' + erro.message });
        }
    },

    testar: async (req, res) => {
        const { sql } = req.body;
        try {
            if (!db.oracle) return res.status(500).json({ error: 'Erro conexão Oracle' });
            
            // Remove ; final se houver
            const sqlLimpo = sql.replace(/;$/, ''); 
            // Limita linhas para evitar crash no front
            const sqlFinal = `SELECT * FROM (${sqlLimpo}) WHERE ROWNUM <= 500`;
            
            console.log("Executando SQL:", sqlFinal);
            const resultados = await db.oracle.raw(sqlFinal);
            return res.json({ success: true, dados: resultados });
        } catch (erro) {
            console.error("Erro Oracle:", erro.message);
            return res.status(500).json({ success: false, error: erro.message });
        }
    }
};