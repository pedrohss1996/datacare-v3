// src/controllers/indicadoresController.js
const db = require('../infra/database/connection');

// Função auxiliar para criar URLs amigáveis (slugs)
function gerarSlug(texto) {
    return texto
        .toString()
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

module.exports = {

    // --- ROTA 1: LISTAR ---
    listar: async (req, res) => {
        try {
            const configs = await db('config_indicadores')
                .where('ativo', true)
                .orderBy('ordem', 'asc');

            res.render('pages/indicadores/lista', {
                title: 'Catálogo de Indicadores',
                layout: 'layouts/main',
                user: req.user,
                indicadores: configs
            });

        } catch (erro) {
            console.error('Erro ao listar:', erro);
            res.render('pages/500', { title: 'Erro 500', error: erro, layout: 'layouts/main', user: req.user });
        }
    },

    // --- ROTA 2: VISUALIZAR (Dashboard Real) ---
    visualizar: async (req, res) => {
        const { nome_indicador } = req.params;
        
        // Configura datas padrão
        const hoje = new Date();
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const toDateString = (date) => date.toISOString().split('T')[0];

        const data_inicio = req.query.data_inicio || toDateString(inicioMes);
        const data_fim = req.query.data_fim || toDateString(hoje);

        // 1. CAPTURAR O NOVO FILTRO DE TEXTO
        // Se não vier nada, usamos string vazia
        const filtro_extra = req.query.filtro_extra || ''; 

        try {
            const indicadorConfig = await db('config_indicadores')
                .where('slug', nome_indicador)
                .andWhere('ativo', true)
                .first();

            if (!indicadorConfig) {
                return res.status(404).render('pages/404', { 
                    title: 'Não Encontrado', 
                    message: 'Indicador não encontrado',
                    layout: 'layouts/main', 
                    user: req.user 
                });
            }

            let resultado = [];
            let labels = []; 
            let values = [];
            const tipoGrafico = indicadorConfig.tipo_grafico || 'table';

            console.log(`\n--- Processando: ${nome_indicador} ---`);
            console.log(`Tipo: ${tipoGrafico} | Fonte: ${indicadorConfig.fonte_dados}`);
            console.log(`Filtros: ${data_inicio} até ${data_fim} | Texto: "${filtro_extra}"`);

            // ========================================================
            // DECISÃO: MOCK OU ORACLE?
            // ========================================================
            
            if (indicadorConfig.fonte_dados === 'oracle') {
                // --- CAMINHO ORACLE (REAL) ---
                if (!db.oracle) {
                    throw new Error('Conexão Oracle não configurada ou indisponível.');
                }

                console.log('🔌 Executando query no Tasy/Oracle...');

                const termoFiltro = filtro_extra || '';
                
                // 2. PASSAR O FILTRO EXTRA PARA O ORACLE
                const rawData = await db.oracle.raw(indicadorConfig.query_sql, {
                    data_inicio: data_inicio, 
                    data_fim: data_fim,
                    filtro_extra: termoFiltro // Manda string vazia se não tiver filtro
                });

                resultado = rawData; 

                // --- INTELIGÊNCIA DE GRÁFICO AUTOMÁTICA ---
                if (resultado.length > 0) {
                    const colunas = Object.keys(resultado[0]);
                    
                    if (colunas.length >= 2) {
                        const keyLabel = colunas[0];
                        const keyValue = colunas[1];

                        labels = resultado.map(r => r[keyLabel]);
                        values = resultado.map(r => r[keyValue]);
                    } else {
                        console.warn('Query retornou menos de 2 colunas. Gráfico pode ficar vazio.');
                    }
                }

            } else {
                // --- CAMINHO MOCK (DADOS FALSOS) ---
                console.log('⚠️ Usando dados Mockados (fonte_dados != oracle)');
                
                if (nome_indicador === 'taxa-ocupacao') {
                    resultado = [ { status: 'Ocupado', valor: 85 }, { status: 'Livre', valor: 15 } ];
                } else if (nome_indicador.includes('fatur')) {
                    resultado = [ { hora: '08:00', total: 5000 }, { hora: '10:00', total: 12500 }, { hora: '16:00', total: 22000 } ];
                } else {
                    resultado = [ { categoria: 'Exemplo A', qtd: 45 }, { categoria: 'Exemplo B', qtd: 20 } ];
                }

                if(resultado.length > 0) {
                    const chaves = Object.keys(resultado[0]);
                    labels = resultado.map(i => i[chaves[0]]);
                    values = resultado.map(i => i[chaves[1]]);
                }
            }

            // Renderiza
            res.render('pages/indicadores/dashboard-dinamico', {
                title: indicadorConfig.titulo,
                layout: 'layouts/main',
                user: req.user,
                
                // 3. DEVOLVER O FILTRO PARA A VIEW (INPUT)
                filtros: { 
                    data_inicio, 
                    data_fim, 
                    filtro_extra 
                },
                
                indicador: {
                    config: {
                        ...indicadorConfig,
                        tipo_grafico: tipoGrafico 
                    },
                    dados: resultado,
                    chartData: { labels, values },
                    erro: false
                }
            });

        } catch (erro) {
            console.error('Erro ao visualizar indicador:', erro);
            res.render('pages/500', { title: 'Erro ao processar', error: erro, layout: 'layouts/main', user: req.user });
        }
    },

    // --- MÉTODOS CRUD (Mantidos iguais) ---
    criar: (req, res) => {
        try {
            res.render('pages/indicadores/form-indicador', {
                title: 'Novo Indicador',
                layout: 'layouts/main',
                user: req.user,
                indicador: null 
            });
        } catch (erro) {
            res.render('pages/500', { title: 'Erro', error: erro, layout: 'layouts/main', user: req.user });
        }
    },

    salvar: async (req, res) => {
        const { titulo, descricao, tipo_grafico, query_sql, fonte_dados } = req.body;

        try {
            const slug = gerarSlug(titulo);

            await db('config_indicadores').insert({
                titulo,
                descricao,
                slug,
                tipo_grafico,
                query_sql,
                ativo: true,
                fonte_dados: fonte_dados || 'mock' 
            });

            return res.redirect('/indicadores');

        } catch (erro) {
            console.error('Erro ao salvar indicador:', erro);
            res.render('pages/500', { title: 'Erro ao salvar', error: erro, layout: 'layouts/main', user: req.user });
        }
    },

    editar: async (req, res) => {
        const { id } = req.params;
        try {
            const indicador = await db('config_indicadores').where({ id }).first();
            if (!indicador) return res.status(404).send('Não encontrado');
            
            res.render('pages/indicadores/form-indicador', {
                title: `Editar: ${indicador.titulo}`,
                layout: 'layouts/main',
                user: req.user,
                indicador: indicador 
            });
        } catch (erro) {
            res.render('pages/500', { title: 'Erro editar', error: erro, layout: 'layouts/main', user: req.user });
        }
    },

    atualizar: async (req, res) => {
        const { id } = req.params;
        const { titulo, descricao, tipo_grafico, query_sql, fonte_dados } = req.body;

        try {
            const slug = gerarSlug(titulo);

            await db('config_indicadores')
                .where({ id })
                .update({
                    titulo,
                    descricao,
                    slug,
                    tipo_grafico,
                    query_sql,
                    fonte_dados: fonte_dados
                });

            return res.redirect('/indicadores');

        } catch (erro) {
            console.error('Erro ao atualizar indicador:', erro);
            res.render('pages/500', { title: 'Erro ao atualizar', error: erro, layout: 'layouts/main', user: req.user });
        }
    },

    excluir: async (req, res) => {
        const { id } = req.params;
        try {
            await db('config_indicadores').where({ id }).del();
            return res.redirect('/indicadores');
        } catch (erro) {
            res.render('pages/500', { title: 'Erro excluir', error: erro, layout: 'layouts/main', user: req.user });
        }
    }
};