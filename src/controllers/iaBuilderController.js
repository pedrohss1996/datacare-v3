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
ESTILO VISUAL (BOOTSTRAP 5 PROFISSIONAL):
- Framework: Bootstrap 5.3 (CDN) + FontAwesome 6 (CDN).
- Layout: Dashboard moderno, espaçamento (p-4, m-3), sombras suaves (shadow-sm).
- Cores: Use paleta hospitalar/corporativa (Azul, Branco, Cinza, Verde para sucesso, Vermelho para pendências).
- Cards: Use cards para KPIs no topo.
- Interatividade: O script deve ler 'window.DADOS_DB' e gerar os gráficos automaticamente.
`;

module.exports = {

    index: async (req, res) => {
        try {
            const queries = await db('gerenciador_queries').select('id', 'titulo').orderBy('titulo', 'asc');
            res.render('pages/ia-builder/index', {
                title: 'IA Page Builder Pro',
                layout: 'layouts/main',
                user: req.user,
                datasets: queries
            });
        } catch (error) { res.redirect('/'); }
    },

    // ... (index mantido) ...

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

            // 2. IA Pro
            const model = genAI.getGenerativeModel({ model: "gemini-pro-latest" });
            
            const promptFinal = `
                ${schemaContext}
                ${STYLE_GUIDE}
                
                PEDIDO: "${promptUsuario}"
                ${queryId ? "NOTA: Use o dataset selecionado. Qualquer ajuste solicitado não deve refazer a pagina, a pagina ela vai ser construida somente uma unica vez e você só vai aplicar as mudanças solicitadas" : ""}

                VOCÊ É UM ARQUITETO DE SOFTWARE.
                Gere dois blocos de código (SQL e HTML).
                
                1. SQL ORACLE:
                   - Use CTE (WITH dataset AS...).
                   - Formate datas TO_CHAR.
                   - APENAS O CÓDIGO PURO, SEM COMENTÁRIOS MARKDOWN DENTRO DO BLOCO.

                2. HTML5:
                   - Bootstrap 5 + Chart.js.
                   - Script que lê window.DADOS_DB.

                FORMATO DE RESPOSTA (TXT):
                [[SQL_START]]
                ...sql aqui...
                [[SQL_END]]

                [[HTML_START]]
                ...html aqui...
                [[HTML_END]]
            `;

            console.log("Gerando...");
            const result = await model.generateContent(promptFinal);
            const response = await result.response;
            const text = response.text();

            // 3. EXTRAÇÃO E LIMPEZA (A CORREÇÃO ESTÁ AQUI) 👇
            const sqlMatch = text.match(/\[\[SQL_START\]\]([\s\S]*?)\[\[SQL_END\]\]/);
            const htmlMatch = text.match(/\[\[HTML_START\]\]([\s\S]*?)\[\[HTML_END\]\]/);

            if (!sqlMatch || !htmlMatch) {
                throw new Error("A IA não gerou os blocos corretamente. Tente novamente.");
            }

            // Remove Markdown (```sql, ```html, ```) que a IA adora colocar
            let sqlLimpo = sqlMatch[1]
                .replace(/```sql/gi, '') // Remove ```sql
                .replace(/```/g, '')     // Remove ```
                .trim();                 // Remove espaços extras

            let htmlLimpo = htmlMatch[1]
                .replace(/```html/gi, '')
                .replace(/```/g, '')
                .trim();

            return res.json({ 
                success: true, 
                data: { 
                    sql: sqlLimpo, 
                    html: htmlLimpo 
                } 
            });

        } catch (erro) {
            console.error('Erro IA:', erro);
            return res.status(500).json({ success: false, error: erro.message });
        }
    },

    // ... (testar mantido) ...
    testar: async (req, res) => {
        const { sql } = req.body;
        try {
            if (!db.oracle) return res.status(500).json({ error: 'Erro conexão Oracle' });
            
            // Remove ; final se houver
            const sqlLimpo = sql.replace(/;$/, ''); 
            // Limita linhas para evitar crash no front
            const sqlFinal = `SELECT * FROM (${sqlLimpo}) WHERE ROWNUM <= 1000`;
            
            console.log("Executando SQL Oracle:", sqlFinal);
            const resultados = await db.oracle.raw(sqlFinal);
            return res.json({ success: true, dados: resultados });
        } catch (erro) {
            console.error("Erro Oracle:", erro.message);
            return res.status(500).json({ success: false, error: erro.message });
        }
    }
};