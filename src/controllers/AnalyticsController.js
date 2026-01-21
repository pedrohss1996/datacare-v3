// ARQUIVO: src/controllers/AnalyticsController.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const db = require('../infra/database/connection'); 

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const sqlExpertContext = `
    Você é um DBA Oracle Sênior.
    REGRAS:
    1. Datas: TRUNC(SYSDATE) ou TO_CHAR(data, 'HH24').
    2. Group By: Obrigatório para colunas não agregadas.
    3. Limite: FETCH FIRST 200 ROWS ONLY.
    4. SAÍDA: Apenas SQL puro.
`;

/**
 * CONTEXTO BI: "REAL-TIME CALCULATION MODE"
 * Obriga a IA a escrever scripts que calculam os números, proibindo valores estáticos.
 */
const biExpertContext = `
    Você é um Engenheiro de Frontend Sênior.
    
    SUA MISSÃO:
    Criar um Dashboard HTML que processe a variável 'window.DB_DATA' para gerar visualizações.
    
    🚫 PROIBIÇÕES (RIGOROSO):
    1. NÃO coloque dados JSON no código.
    2. NÃO escreva números estáticos no HTML (Ex: Não escreva <span>R$ 1.000</span>).
    3. NÃO invente dados.
    
    ✅ OBRIGAÇÕES (CÁLCULO DINÂMICO):
    1. **KPIs**: Deixe o HTML vazio ou com "Carregando..." (ex: <span id="kpi-total">...</span>).
       - No <script>, use .reduce() ou .length em 'window.DB_DATA' para calcular o valor.
       - Atualize o DOM via JS: document.getElementById('kpi-total').innerText = valorCalculado;
    
    2. **GRÁFICOS**:
       - No <script>, use .map() em 'window.DB_DATA' para criar os arrays de labels e data.
       - new Chart(ctx, { data: { labels: labelsMap, datasets: [{ data: valuesMap }] } });

    3. **AUTO-DETECÇÃO**:
       - O script deve ser inteligente. Se window.DB_DATA estiver vazio, mostre um aviso na tela.
       - Use as colunas sugeridas abaixo, mas trate maiúsculas/minúsculas.

    ESTRUTURA:
    - Bibliotecas: Tailwind CSS, Chart.js, ChartDataLabels.
    - Layout: Grid responsivo.
    - Script: Lógica de cálculo + Renderização dos gráficos.

    SAÍDA:
    Retorne APENAS o código HTML.
`;

const analyticsController = {

    index: async (req, res) => {
        try {
            let savedWidgets = [];
            try { savedWidgets = await db('analytics_widgets').where('is_active', true).orderBy('id', 'desc'); } catch (e) {}
            res.render('pages/analytics/index', { title: 'Analytics Builder', user: req.user, savedWidgets });
        } catch (error) {
            console.error(error);
            res.status(500).render('pages/500', { error });
        }
    },

    preview: async (req, res) => {
        try {
            let { prompt, sqlQuery } = req.body;
            let data = [];
            let generatedSql = sqlQuery || "";

            // 1. Executar SQL
            if (generatedSql) {
                console.log(`[Oracle] Executando: ${generatedSql}`);
                try {
                    const connection = db.oracle ? db.oracle : db;
                    const result = await connection.raw(generatedSql);
                    data = result.rows || result; 
                } catch (dbError) {
                    return res.json({ success: false, isDraft: true, message: `Erro SQL: ${dbError.message}`, generatedSql });
                }
            } else if (prompt) {
                const resultSql = await model.generateContent(`${sqlExpertContext}\nPEDIDO: "${prompt}"`);
                generatedSql = resultSql.response.text().replace(/```sql/g, '').replace(/```/g, '').trim().replace(/;$/, '');
                return res.json({ success: false, isDraft: true, message: "Confirme a query gerada.", generatedSql });
            } else {
                return res.json({ success: false, message: 'Sem dados.' });
            }

            if (!data || data.length === 0) {
                return res.json({ success: false, message: 'Retorno vazio.' });
            }

            // --- AUTO-DETECÇÃO DE COLUNAS ---
            const actualColumns = Object.keys(data[0]);
            let labelCol = actualColumns.find(c => typeof data[0][c] === 'string') || actualColumns[0];
            let valueCol = actualColumns.find(c => typeof data[0][c] === 'number') || actualColumns[1] || actualColumns[0];

            console.log(`[AI-BI] Gerando Dashboard Dinâmico...`);

            // Prompt Reforçado para Cálculo
            const promptAI = `
                ${biExpertContext}
                
                METADADOS DOS DADOS REAIS:
                - Colunas Disponíveis: ${JSON.stringify(actualColumns)}
                - Use a coluna '${labelCol}' para Rótulos/Textos.
                - Use a coluna '${valueCol}' para Valores/Somatórios.
                
                PEDIDO DO USUÁRIO: "${prompt || 'Gere o dashboard'}"
                
                LEMBRE-SE: 
                O script gerado deve conter linhas como:
                "const total = window.DB_DATA.reduce((acc, item) => acc + item.${valueCol}, 0);"
                NÃO escreva o valor final no HTML. Calcule-o.
            `;

            const resultViz = await model.generateContent(promptAI);
            
            let htmlAI = resultViz.response.text()
                .replace(/```html/g, '')
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .trim();

            res.json({ 
                success: true, 
                previewHtml: htmlAI, 
                generatedSql: generatedSql, 
                rawResult: data 
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: error.message });
        }
    },

    saveWidget: async (req, res) => {
        try {
            const { title, prompt, sqlQuery, htmlTemplate } = req.body;
            const [id] = await db('analytics_widgets').insert({
                title, description: prompt, oracle_sql_query: sqlQuery, html_template: htmlTemplate
            }).returning('id');
            res.json({ success: true, id });
        } catch (e) { res.status(500).json({ success: false, message: e.message }); }
    },

    deleteWidget: async (req, res) => {
        try {
            const { id } = req.params;
            await db('analytics_widgets').where('id', id).del();
            res.json({ success: true });
        } catch (e) { res.status(500).json({ success: false, message: e.message }); }
    }
};

module.exports = analyticsController;