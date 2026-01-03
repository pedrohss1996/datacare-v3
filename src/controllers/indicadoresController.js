// src/controllers/indicadoresController.js
const db = require('../infra/database/connection');

// Função auxiliar para criar URLs amigáveis (slugs)
function gerarSlug(texto) {
    return texto
        .toString()
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/\s+/g, '-')           // Espaços viram hífens
        .replace(/[^\w\-]+/g, '')       // Remove caracteres especiais
        .replace(/\-\-+/g, '-')         // Remove hífens duplicados
        .replace(/^-+/, '')             // Remove hífen do começo
        .replace(/-+$/, '');            // Remove hífen do fim
}

module.exports = {

    // --- ROTA 1: LISTAR (O Menu) ---
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
            console.error('Erro ao listar indicadores:', erro);
            // CORREÇÃO: Adicionado 'title'
            res.render('pages/500', { title: 'Erro 500', error: erro, layout: 'layouts/main', user: req.user });
        }
    },

    // --- ROTA 2: VISUALIZAR (O Dashboard com Gráficos e Filtros) ---
    visualizar: async (req, res) => {
        const { nome_indicador } = req.params;
        
        const hoje = new Date();
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const toDateString = (date) => date.toISOString().split('T')[0];

        const data_inicio = req.query.data_inicio || toDateString(inicioMes);
        const data_fim = req.query.data_fim || toDateString(hoje);

        try {
            const indicadorConfig = await db('config_indicadores')
                .where('slug', nome_indicador)
                .andWhere('ativo', true)
                .first();

            if (!indicadorConfig) {
                return res.status(404).render('pages/404', { 
                    title: 'Não Encontrado', // Adicionado title também aqui por segurança
                    message: 'Indicador não encontrado',
                    layout: 'layouts/main', 
                    user: req.user 
                });
            }

            // MOCK INTELIGENTE
            let resultado = [];
            let labels = []; 
            let values = [];
            const tipoGrafico = indicadorConfig.tipo_grafico || 'table';

            console.log(`Processando: ${nome_indicador} | Tipo: ${tipoGrafico}`);

            if (nome_indicador === 'taxa-ocupacao') {
                resultado = [
                    { status: 'Ocupado', valor: 85, color: '#EF4444' }, 
                    { status: 'Livre', valor: 15, color: '#10B981' }
                ];
                labels = resultado.map(item => item.status);
                values = resultado.map(item => item.valor);

            } else if (nome_indicador === 'faturamento-dia' || nome_indicador.includes('fatur')) {
                resultado = [
                    { hora: '08:00', total: 5000 },
                    { hora: '10:00', total: 12500 },
                    { hora: '12:00', total: 8500 },
                    { hora: '14:00', total: 15000 },
                    { hora: '16:00', total: 22000 }
                ];
                labels = resultado.map(item => item.hora);
                values = resultado.map(item => item.total);

            } else if (nome_indicador === 'total-pessoas' || nome_indicador.includes('pessoa')) {
                resultado = [
                    { categoria: 'Médicos', qtd: 45 },
                    { categoria: 'Enfermeiros', qtd: 120 },
                    { categoria: 'Admin', qtd: 30 },
                    { categoria: 'TI', qtd: 12 }
                ];
                labels = resultado.map(item => item.categoria);
                values = resultado.map(item => item.qtd);

            } else {
                resultado = [{ info: 'Dados não simulados', valor: 0 }];
            }

            res.render('pages/indicadores/dashboard-dinamico', {
                title: indicadorConfig.titulo,
                layout: 'layouts/main',
                user: req.user,
                filtros: { data_inicio, data_fim },
                indicador: {
                    config: { ...indicadorConfig, tipo_grafico: tipoGrafico },
                    dados: resultado,
                    chartData: { labels, values },
                    erro: false
                }
            });

        } catch (erro) {
            console.error('Erro ao visualizar indicador:', erro);
            // CORREÇÃO: Adicionado 'title'
            res.render('pages/500', { title: 'Erro ao visualizar', error: erro, layout: 'layouts/main', user: req.user });
        }
    },

    // 1. Renderiza o formulário vazio para criar novo
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

    // 2. Recebe os dados do POST e salva no banco
    salvar: async (req, res) => {
        const { titulo, descricao, tipo_grafico, query_sql } = req.body;
        try {
            const slug = gerarSlug(titulo);
            await db('config_indicadores').insert({
                titulo,
                descricao,
                slug,
                tipo_grafico,
                query_sql,
                ativo: true,
                fonte_dados: 'mock' 
            });
            return res.redirect('/indicadores');
        } catch (erro) {
            console.error('Erro ao salvar indicador:', erro);
            res.render('pages/500', { title: 'Erro ao salvar', error: erro, layout: 'layouts/main', user: req.user });
        }
    },

    // 3. Busca os dados e renderiza o formulário para edição
    editar: async (req, res) => {
        const { id } = req.params;
        try {
            const indicador = await db('config_indicadores').where({ id }).first();
            if (!indicador) {
                return res.status(404).render('pages/404', { title: 'Não Encontrado', message: 'Indicador não encontrado', layout: 'layouts/main', user: req.user });
            }
            res.render('pages/indicadores/form-indicador', {
                title: `Editar: ${indicador.titulo}`,
                layout: 'layouts/main',
                user: req.user,
                indicador: indicador 
            });
        } catch (erro) {
            console.error('Erro ao buscar indicador para edição:', erro);
            res.render('pages/500', { title: 'Erro ao editar', error: erro, layout: 'layouts/main', user: req.user });
        }
    },

    // 4. Atualiza os dados no banco
    atualizar: async (req, res) => {
        const { id } = req.params;
        const { titulo, descricao, tipo_grafico, query_sql } = req.body;
        try {
            const slug = gerarSlug(titulo);
            await db('config_indicadores')
                .where({ id })
                .update({
                    titulo,
                    descricao,
                    slug,
                    tipo_grafico,
                    query_sql
                });
            return res.redirect('/indicadores');
        } catch (erro) {
            console.error('Erro ao atualizar indicador:', erro);
            res.render('pages/500', { title: 'Erro ao atualizar', error: erro, layout: 'layouts/main', user: req.user });
        }
    },

    // 5. Exclui (ou inativa) o indicador
    excluir: async (req, res) => {
        const { id } = req.params;
        try {
            await db('config_indicadores').where({ id }).del();
            return res.redirect('/indicadores');
        } catch (erro) {
            console.error('Erro ao excluir indicador:', erro);
            res.render('pages/500', { title: 'Erro ao excluir', error: erro, layout: 'layouts/main', user: req.user });
        }
    }
};