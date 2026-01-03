// ARQUIVO: src/controllers/indicadoresController.js
const { dbApp, dbOracle } = require('../infra/database/connection');

module.exports = {
    // 1. Renderiza a tela
    async dashboard(req, res) {
        try {
            const indicadores = await dbApp('sis_indicadores')
                .where('ativo', true)
                .orderBy('id', 'desc');

            // CORREÇÃO AQUI: Adicionamos o 'title'
            return res.render('pages/indicadores/index', { 
                indicadores,
                title: 'Dashboard de Indicadores' // <--- A linha que faltava
            });
        } catch (error) {
            console.error(error);
            return res.status(500).send('Erro ao carregar dashboard');
        }
    },

    // 2. API que busca os dados do gráfico
        async obterDados(req, res) {
        const { id } = req.params;
        
        try {
            const indicador = await dbApp('sis_indicadores').where('id', id).first();
            if (!indicador) return res.status(404).json({ error: 'Não encontrado' });

            // 1. Executa Query (Usando dbApp por enquanto)
            const conexaoExecucao = dbApp; 
            const resultado = await conexaoExecucao.raw(indicador.consulta_sql);
            const linhas = resultado.rows ? resultado.rows : resultado;

            // 2. Separa Labels e Valores
            const labels = linhas.map(l => l.label || l.LABEL || Object.values(l)[0]);
            
            // Converte string para número (sua correção anterior)
            const values = linhas.map(l => {
                const valorBruto = l.valor || l.VALOR || Object.values(l)[1];
                return Number(valorBruto); 
            });

            // 3. LÓGICA DE CORREÇÃO DO APEXCHARTS
            // Se for Pizza/Donut, a série é apenas o array de números [10, 20, 30]
            // Se for Barra/Linha, a série é um objeto [{ name: 'Titulo', data: [10, 20] }]
            const isCircular = ['pie', 'donut', 'radialBar'].includes(indicador.tipo_grafico);
            
            let seriesFormatada;
            
            if (isCircular) {
                seriesFormatada = values; // Ex: [10, 5, 2]
            } else {
                seriesFormatada = [{ name: indicador.titulo, data: values }]; // Ex: [{ data: [10, 5] }]
            }

            return res.json({
                titulo: indicador.titulo,
                tipo: indicador.tipo_grafico,
                series: seriesFormatada, // Envia o formato correto
                labels: labels,
                config: indicador.configuracao
            });

        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Erro ao processar gráfico' });
        }
    }
};