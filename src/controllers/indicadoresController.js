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


    // =========================================================================
    // 0. ÁREA ADMINISTRATIVA (Backoffice)
    // =========================================================================
    gerenciar: async (req, res) => {
        try {
            // Verifica se é Admin (Opcional, mas recomendado)
            // if (req.user.grupo_id !== 1) return res.redirect('/indicadores/visualizar');

            // Busca indicadores com o nome da pasta (Left Join)
            const lista = await db('config_indicadores as i')
                .leftJoin('indicadores_pastas as p', 'i.pasta_id', 'p.id')
                .select('i.*', 'p.nome as pasta_nome', 'p.cor_hex as pasta_cor')
                .orderBy('i.id', 'desc');

            res.render('pages/indicadores/lista-admin', {
                title: 'Gestão de Indicadores',
                layout: 'layouts/main',
                user: req.user,
                indicadores: lista
            });

        } catch (erro) {
            res.render('pages/500', { error: erro, user: req.user, layout: 'layouts/main' });
        }
    },


    // =========================================================================
    // 1. TELA PRINCIPAL (DASHBOARD DE PASTAS)
    // =========================================================================
    // Substitui o antigo 'listar' para mostrar pastas baseadas na permissão
    visualizacao: async (req, res) => {
        try {
            // Pega ID do usuário logado
            const userId = req.user.id; 

            // 1. Descobrir qual o Grupo do Usuário
            const usuario = await db('usuarios')
                .where('cd_usuario', userId)
                .select(
                'cd_usuario as id', 
                'nm_usuario as nome', 
                'grupo_id')
                .first();

            // Segurança: Se não tem grupo, bloqueia
            if (!usuario || !usuario.grupo_id) {
                return res.render('pages/indicadores/visualizar', {
                    title: 'Acesso Negado',
                    pastas: [],
                    user: req.user,
                    aviso: 'Seu usuário não possui um Grupo de Acesso definido.'
                });
            }

            // 2. Buscar APENAS as pastas permitidas para este grupo
            const pastas = await db('indicadores_pastas as p')
                .join('indicadores_permissoes as perm', 'p.id', 'perm.pasta_id')
                .where('perm.grupo_id', usuario.grupo_id)
                .andWhere('p.ativo', true)
                .select('p.id', 'p.nome', 'p.descricao', 'p.icone', 'p.cor_hex')
                .orderBy('p.ordem', 'asc');
    
            // 3. Renderiza a View (Visualização Clean)
            const isAdmin = (usuario.grupo_id === 1);
            return res.render('pages/indicadores/visualizar', {
                title: 'Central de Indicadores',
                layout: 'layouts/main',
                user: req.user,
                pastas: pastas,
                isAdmin: isAdmin
            });

        } catch (erro) {
            console.error('Erro ao carregar dashboard:', erro);
            // CORREÇÃO: Adicionado 'title' e 'layout' para não quebrar a tela de erro 500
            return res.render('pages/500', { 
                title: 'Erro Interno', 
                error: erro, 
                user: req.user,
                layout: 'layouts/main' // Garante que carregue o estilo
            });
        }
    },

    // =========================================================================
    // 2. API: LISTAR INDICADORES DA PASTA (JSON)
    // =========================================================================
    getIndicadoresDaPasta: async (req, res) => {
        const { pastaId } = req.params;
        
        // Ajuste aqui: Tenta pegar cd_usuario OU id (para garantir compatibilidade)
        const userId = req.user.cd_usuario || req.user.id; 

        try {
            // 1. Busca grupo do usuário (usando cd_usuario)
            const usuario = await db('usuarios')
                .where('cd_usuario', userId) 
                .select('grupo_id')
                .first();

            if (!usuario) return res.status(401).json({ error: 'Usuário não encontrado.' });
            
            // 2. Verifica permissão (Admin Grupo 1 sempre passa)
            const permissao = await db('indicadores_permissoes')
                .where({ pasta_id: pastaId, grupo_id: usuario.grupo_id })
                .first();

            if (!permissao && usuario.grupo_id !== 1) {
                return res.status(403).json({ error: 'Você não tem permissão nesta pasta.' });
            }

            // 3. Busca indicadores (AGORA COM A COLUNA RESPONSAVEL EXISTINDO)
            const indicadores = await db('config_indicadores')
                .where({ pasta_id: pastaId, ativo: true })
                .select('id', 'titulo', 'descricao', 'tipo_grafico', 'responsavel', 'slug') // <--- Essa coluna agora existe!
                .orderBy('titulo');

            return res.json(indicadores);

        } catch (erro) {
            console.error('Erro API Pasta:', erro);
            return res.status(500).json({ error: 'Erro ao buscar indicadores.' });
        }
    },
    // =========================================================================
    // 3. API: DADOS DO INDICADOR (Lógica Oracle/Mock portada)
    // =========================================================================
    // Essa função substitui sua antiga rota 'visualizar'. 
    // Em vez de renderizar HTML, ela retorna JSON para o gráfico.
    getDadosIndicador: async (req, res) => {
        const { id } = req.params; // Agora buscamos pelo ID, não pelo Slug (mais seguro)
        
        // Configura datas padrão (Sua lógica original)
        const hoje = new Date();
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const toDateString = (date) => date.toISOString().split('T')[0];

        const data_inicio = req.query.data_inicio || toDateString(inicioMes);
        const data_fim = req.query.data_fim || toDateString(hoje);
        const filtro_extra = req.query.filtro_extra || ''; 

        try {
            const indicadorConfig = await db('config_indicadores')
                .where('id', id) // Busca por ID
                .andWhere('ativo', true)
                .first();

            if (!indicadorConfig) return res.status(404).json({ error: 'Indicador não encontrado' });

            let resultado = [];
            let dadosFormatados = [];
            
            // --- DECISÃO: MOCK OU ORACLE? (Sua lógica original mantida) ---
            
            if (indicadorConfig.fonte_dados === 'oracle') {
                if (!db.oracle) throw new Error('Conexão Oracle indisponível.');

                const rawData = await db.oracle.raw(indicadorConfig.query_sql, {
                    data_inicio, data_fim, filtro_extra
                });
                resultado = rawData;

            } else {
                // --- MOCK ---
                // Mantive sua lógica de mock, apenas ajustando o retorno para o padrão {x, y}
                if (indicadorConfig.slug === 'taxa-ocupacao') {
                    resultado = [ { x: 'Ocupado', y: 85 }, { x: 'Livre', y: 15 } ];
                } else if (indicadorConfig.slug.includes('fatur')) {
                    resultado = [ { x: '08:00', y: 5000 }, { x: '10:00', y: 12500 }, { x: '16:00', y: 22000 } ];
                } else {
                    resultado = [ { x: 'Exemplo A', y: 45 }, { x: 'Exemplo B', y: 20 } ];
                }
            }

            // --- TRADUTOR INTELIGENTE PARA O FRONTEND ---
            // O Chart.js espera [{x: ..., y: ...}]. Se vier do Oracle colunas aleatórias, normalizamos aqui.
            if (indicadorConfig.fonte_dados === 'oracle' && resultado.length > 0) {
                const colunas = Object.keys(resultado[0]);
                if (colunas.length >= 2) {
                    dadosFormatados = resultado.map(r => ({
                        x: r[colunas[0]], // Primeira coluna = Eixo X (Texto)
                        y: r[colunas[1]]  // Segunda coluna = Eixo Y (Valor)
                    }));
                } else {
                     // Fallback se vier só 1 coluna
                    dadosFormatados = resultado.map(r => ({ x: Object.values(r)[0], y: 0 }));
                }
            } else if (indicadorConfig.fonte_dados !== 'oracle') {
                dadosFormatados = resultado; // Mock já está formatado
            }

            // Retorna JSON pronto para o Visualizar.js desenhar o gráfico
            return res.json({
                config: {
                    titulo: indicadorConfig.titulo,
                    tipo: indicadorConfig.tipo_grafico || 'bar',
                    responsavel: indicadorConfig.responsavel,
                    fonte: indicadorConfig.fonte_dados
                },
                data: dadosFormatados
            });

        } catch (erro) {
            console.error('Erro API Dados:', erro);
            return res.status(500).json({ error: erro.message });
        }
    },

    // =========================================================================
    // 4. CRUD (Atualizado com pasta_id)
    // =========================================================================

    criar: async (req, res) => {
        try {
            // Precisamos enviar as pastas para o select
            const pastas = await db('indicadores_pastas').where('ativo', true).orderBy('nome');
            
            res.render('pages/indicadores/form-indicador', {
                title: 'Novo Indicador',
                layout: 'layouts/main',
                user: req.user,
                indicador: null,
                pastas: pastas // Envia pastas para o dropdown
            });
        } catch (erro) {
            res.render('pages/500', { error: erro, user: req.user });
        }
    },

    salvar: async (req, res) => {
        const { titulo, descricao, tipo_grafico, query_sql, fonte_dados, pasta_id, responsavel } = req.body;

        try {
            // CORREÇÃO: Slug Único (Nome + 4 números aleatórios de tempo)
            // Isso evita o erro "duplicate key" se você repetir nomes.
            const timestamp = new Date().getTime().toString().slice(-4);
            const slug = `${gerarSlug(titulo)}-${timestamp}`;

            await db('config_indicadores').insert({
                titulo,
                descricao,
                slug, // Agora o slug é blindado (ex: faturamento-9821)
                tipo_grafico,
                query_sql,
                pasta_id: pasta_id ? parseInt(pasta_id) : null, 
                responsavel: responsavel || 'Não informado',
                ativo: true,
                fonte_dados: fonte_dados || 'mock'
            });

            return res.redirect('/indicadores/visualizar'); 

        } catch (erro) {
            console.error('Erro ao salvar indicador:', erro);
            
            return res.render('pages/500', { 
                title: 'Erro ao Salvar', 
                error: erro, 
                layout: 'layouts/main', 
                user: req.user 
            });
        }
    },

    editar: async (req, res) => {
        const { id } = req.params;
        try {
            const indicador = await db('config_indicadores').where({ id }).first();
            const pastas = await db('indicadores_pastas').where('ativo', true).orderBy('nome');

            if (!indicador) return res.status(404).send('Não encontrado');
            
            res.render('pages/indicadores/form-indicador', {
                title: `Editar: ${indicador.titulo}`,
                layout: 'layouts/main',
                user: req.user,
                indicador: indicador,
                pastas: pastas
            });
        } catch (erro) {
            res.render('pages/500', { error: erro, user: req.user });
        }
    },

    atualizar: async (req, res) => {
        const { id } = req.params;
        const { titulo, descricao, tipo_grafico, query_sql, fonte_dados, pasta_id, responsavel } = req.body;

        try {
            const timestamp = new Date().getTime().toString().slice(-4); // Pega os 4 últimos dígitos do tempo
            const slug = `${gerarSlug(titulo)}-${timestamp}`;

            await db('config_indicadores')
                .where({ id })
                .update({
                    titulo,
                    descricao,
                    slug,
                    tipo_grafico,
                    query_sql,
                    fonte_dados,
                    pasta_id: pasta_id || null,
                    responsavel
                });

            return res.redirect('/indicadores/visualizar');

        } catch (erro) {
            console.error(erro);
            res.render('pages/500', { error: erro, user: req.user });
        }
    },

    excluir: async (req, res) => {
        const { id } = req.params;
        try {
            await db('config_indicadores').where({ id }).del();
            return res.redirect('/indicadores/visualizar');
        } catch (erro) {
            res.render('pages/500', { error: erro, user: req.user });
        }
    }
};