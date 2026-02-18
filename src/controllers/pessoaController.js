const db = require('../infra/database/connection');
const bcrypt = require('bcryptjs');

// Função auxiliar para padronizar retorno
function getRows(result) {
    if (!result) return [];
    return Array.isArray(result) ? result : (result.rows || []);
}

module.exports = {
    // Renderiza a página principal (lista de usuários)
    index: async (req, res) => {
        try {
            // Busca usuários com informações da pessoa_fisica
            const usuarios = await db('usuarios as u')
                .leftJoin('pessoa_fisica as pf', 'u.cd_pessoa', 'pf.cd_pessoa_fisica')
                .select(
                    'u.cd_usuario',
                    'u.nm_usuario',
                    'u.ds_usuario',
                    'u.ie_situacao',
                    'u.cd_perfil_inicial',
                    'u.grupo_id',
                    'u.dt_criacao',
                    'pf.nr_cpf',
                    'pf.nr_telefone_celular',
                    'pf.ds_email',
                    'pf.cd_pessoa_fisica'
                )
                .orderBy('u.dt_criacao', 'desc');

            res.render('pages/pessoas/index', {
                title: 'Gerenciamento de Usuários - DataCare',
                layout: 'layouts/main',
                user: req.user || req.session.user,
                usuarios: usuarios,
                mensagem: req.query.sucesso ? 'Operação realizada com sucesso!' : null,
                erro: req.query.erro ? req.query.erro : null
            });

        } catch (erro) {
            console.error('Erro ao listar usuários:', erro);
            res.status(500).send('Erro ao buscar lista de usuários.');
        }
    },

    // Renderiza formulário de criação
    renderizarCadastro: async (req, res) => {
        const grupos = await db('admin_grupos').select('*').orderBy('ordem').catch(() => []);
        res.render('pages/pessoas/form', {
            title: 'Novo Usuário',
            layout: 'layouts/main',
            user: req.user || req.session.user,
            dados: {},
            grupos: grupos || [],
            erro: null,
            modo: 'criar'
        });
    },

    // Renderiza formulário de edição
    renderizarEdicao: async (req, res) => {
        try {
            const { id } = req.params;

            const usuario = await db('usuarios as u')
                .leftJoin('pessoa_fisica as pf', 'u.cd_pessoa', 'pf.cd_pessoa_fisica')
                .where('u.cd_usuario', id)
                .select(
                    'u.*',
                    'pf.nm_pessoa_fisica',
                    'pf.nr_cpf as cpf_pessoa',
                    'pf.nr_identidade',
                    'pf.ds_orgao_emissor_ci',
                    'pf.dt_nascimento',
                    'pf.ie_sexo',
                    'pf.nr_telefone_celular',
                    'pf.ds_email',
                    'pf.cd_cep',
                    'pf.ds_endereco',
                    'pf.nr_endereco',
                    'pf.ds_complemento',
                    'pf.ds_bairro',
                    'pf.ds_municipio',
                    'pf.sg_estado'
                )
                .first();

            if (!usuario) {
                return res.redirect('/pessoas?erro=Usuário não encontrado');
            }

            const grupos = await db('admin_grupos').select('*').orderBy('ordem').catch(() => []);
            res.render('pages/pessoas/form', {
                title: 'Editar Usuário',
                layout: 'layouts/main',
                user: req.user || req.session.user,
                dados: usuario,
                grupos: grupos || [],
                erro: req.query.erro || null,
                modo: 'editar'
            });

        } catch (erro) {
            console.error('Erro ao buscar usuário:', erro);
            res.redirect('/pessoas?erro=Erro ao carregar dados do usuário');
        }
    },

    // Cria novo usuário
    cadastrar: async (req, res) => {
        const transacao = await db.transaction();

        const { 
            nome, dt_nascimento, sexo,
            cpf, rg, orgao_rg,
            telefone, email,
            cep, endereco, numero, complemento, bairro, municipio, uf,
            usuario, senha, perfil, situacao
        } = req.body;

        try {
            // Validações
            if (!nome) throw new Error('O campo Nome é obrigatório.');
            if (!usuario) throw new Error('O campo Usuário (login) é obrigatório.');
            if (!senha) throw new Error('O campo Senha é obrigatório.');

            // Limpa CPF e CEP
            const cpfLimpo = cpf ? cpf.replace(/\D/g, '') : null;
            const cepLimpo = cep ? cep.replace(/\D/g, '') : null;

            // Verifica se usuário já existe
            const usuarioExiste = await transacao('usuarios')
                .whereRaw('UPPER(nm_usuario) = ?', [usuario.toUpperCase()])
                .first();

            if (usuarioExiste) {
                throw new Error('Este usuário (login) já está em uso.');
            }

            // 1. Insere pessoa_fisica (se tiver dados)
            let idPessoa = null;
            if (nome || cpfLimpo) {
                const [pessoaCriada] = await transacao('pessoa_fisica').insert({
                    nm_pessoa_fisica: nome ? nome.toUpperCase().trim() : null,
                    nr_cpf: cpfLimpo,
                    nr_identidade: rg ? rg.toUpperCase().trim() : null,
                    ds_orgao_emissor_ci: orgao_rg ? orgao_rg.toUpperCase() : null,
                    dt_nascimento: dt_nascimento || null,
                    ie_sexo: sexo || null,
                    nr_telefone_celular: telefone || null,
                    ds_email: email ? email.toLowerCase().trim() : null,
                    cd_cep: cepLimpo,
                    ds_endereco: endereco ? endereco.toUpperCase() : null,
                    nr_endereco: numero || null,
                    ds_complemento: complemento ? complemento.toUpperCase() : null,
                    ds_bairro: bairro ? bairro.toUpperCase() : null,
                    ds_municipio: municipio ? municipio.toUpperCase() : null,
                    sg_estado: uf || null,
                    dt_cadastro: new Date()
                }).returning('cd_pessoa_fisica');

                idPessoa = pessoaCriada?.cd_pessoa_fisica || pessoaCriada;
            }

            // 2. Hash da senha
            const salt = await bcrypt.genSalt(10);
            const senhaHash = await bcrypt.hash(senha, salt);

            // 3. Insere usuário
            await transacao('usuarios').insert({
                nm_usuario: usuario.trim(),
                ds_usuario: nome ? nome.toUpperCase() : usuario.toUpperCase(),
                ds_senha: senhaHash,
                cd_pessoa: idPessoa,
                cd_perfil_inicial: parseInt(perfil) || 1,
                grupo_id: parseInt(req.body.grupo_id) || 2,
                ie_situacao: situacao || 'A',
                cd_medico_tasy: req.body.cd_medico_tasy ? parseInt(req.body.cd_medico_tasy) : null
            });

            await transacao.commit();
            res.redirect('/pessoas?sucesso=true');

        } catch (erro) {
            await transacao.rollback();
            console.error('Erro no cadastro:', erro);

            let msg = erro.message || 'Erro ao salvar os dados.';

            if (erro.code === '23505') {
                if (erro.detail?.includes('nr_cpf')) msg = 'Este CPF já está cadastrado.';
                if (erro.detail?.includes('nm_usuario')) msg = 'Este Login de usuário já está em uso.';
            }

            res.render('pages/pessoas/form', {
                title: 'Novo Usuário',
                layout: 'layouts/main',
                user: req.user || req.session.user,
                erro: msg,
                dados: req.body,
                modo: 'criar'
            });
        }
    },

    // Atualiza usuário
    atualizar: async (req, res) => {
        const { id } = req.params;
        const transacao = await db.transaction();

            const { 
            nome, dt_nascimento, sexo,
            cpf, rg, orgao_rg,
            telefone, email,
            cep, endereco, numero, complemento, bairro, municipio, uf,
            usuario, senha, perfil, situacao, cd_medico_tasy, grupo_id
        } = req.body;

        try {
            // Busca usuário atual
            const usuarioAtual = await transacao('usuarios')
                .where('cd_usuario', id)
                .first();

            if (!usuarioAtual) {
                throw new Error('Usuário não encontrado.');
            }

            // Limpa CPF e CEP
            const cpfLimpo = cpf ? cpf.replace(/\D/g, '') : null;
            const cepLimpo = cep ? cep.replace(/\D/g, '') : null;

            // 1. Atualiza ou cria pessoa_fisica
            let idPessoa = usuarioAtual.cd_pessoa;
            
            if (idPessoa) {
                // Atualiza pessoa_fisica existente
                await transacao('pessoa_fisica')
                    .where('cd_pessoa_fisica', idPessoa)
                    .update({
                        nm_pessoa_fisica: nome ? nome.toUpperCase().trim() : null,
                        nr_cpf: cpfLimpo,
                        nr_identidade: rg ? rg.toUpperCase().trim() : null,
                        ds_orgao_emissor_ci: orgao_rg ? orgao_rg.toUpperCase() : null,
                        dt_nascimento: dt_nascimento || null,
                        ie_sexo: sexo || null,
                        nr_telefone_celular: telefone || null,
                        ds_email: email ? email.toLowerCase().trim() : null,
                        cd_cep: cepLimpo,
                        ds_endereco: endereco ? endereco.toUpperCase() : null,
                        nr_endereco: numero || null,
                        ds_complemento: complemento ? complemento.toUpperCase() : null,
                        ds_bairro: bairro ? bairro.toUpperCase() : null,
                        ds_municipio: municipio ? municipio.toUpperCase() : null,
                        sg_estado: uf || null
                    });
            } else if (nome || cpfLimpo) {
                // Cria pessoa_fisica se não existir e houver dados
                const [pessoaCriada] = await transacao('pessoa_fisica').insert({
                    nm_pessoa_fisica: nome ? nome.toUpperCase().trim() : null,
                    nr_cpf: cpfLimpo,
                    nr_identidade: rg ? rg.toUpperCase().trim() : null,
                    ds_orgao_emissor_ci: orgao_rg ? orgao_rg.toUpperCase() : null,
                    dt_nascimento: dt_nascimento || null,
                    ie_sexo: sexo || null,
                    nr_telefone_celular: telefone || null,
                    ds_email: email ? email.toLowerCase().trim() : null,
                    cd_cep: cepLimpo,
                    ds_endereco: endereco ? endereco.toUpperCase() : null,
                    nr_endereco: numero || null,
                    ds_complemento: complemento ? complemento.toUpperCase() : null,
                    ds_bairro: bairro ? bairro.toUpperCase() : null,
                    ds_municipio: municipio ? municipio.toUpperCase() : null,
                    sg_estado: uf || null,
                    dt_cadastro: new Date()
                }).returning('cd_pessoa_fisica');

                idPessoa = pessoaCriada?.cd_pessoa_fisica || pessoaCriada;
            }

            // 2. Prepara update do usuário
            const dadosUpdate = {
                nm_usuario: usuario.trim(),
                ds_usuario: nome ? nome.toUpperCase() : usuario.toUpperCase(),
                cd_pessoa: idPessoa, // Atualiza o vínculo com pessoa_fisica
                cd_perfil_inicial: parseInt(perfil) || 1,
                grupo_id: parseInt(grupo_id) || 2,
                ie_situacao: situacao || 'A',
                cd_medico_tasy: cd_medico_tasy ? parseInt(cd_medico_tasy) : null
            };

            // 3. Atualiza senha se foi fornecida
            if (senha && senha.trim() !== '') {
                const salt = await bcrypt.genSalt(10);
                dadosUpdate.ds_senha = await bcrypt.hash(senha, salt);
            }

            // 4. Atualiza usuário
            await transacao('usuarios')
                .where('cd_usuario', id)
                .update(dadosUpdate);

            await transacao.commit();
            res.redirect('/pessoas?sucesso=true');

        } catch (erro) {
            await transacao.rollback();
            console.error('Erro na atualização:', erro);

            res.redirect(`/pessoas/editar/${id}?erro=${encodeURIComponent(erro.message)}`);
        }
    },

    // Exclui usuário
    excluir: async (req, res) => {
        const { id } = req.params;

        try {
            const usuario = await db('usuarios')
                .where('cd_usuario', id)
                .first();

            if (!usuario) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Usuário não encontrado' 
                });
            }

            // Soft delete (muda situação para Inativo)
            await db('usuarios')
                .where('cd_usuario', id)
                .update({
                    ie_situacao: 'I',
                    dt_atualizacao: new Date()
                });

            res.json({ 
                success: true, 
                message: 'Usuário desativado com sucesso' 
            });

        } catch (erro) {
            console.error('Erro ao excluir:', erro);
            res.status(500).json({ 
                success: false, 
                message: 'Erro ao excluir usuário',
                error: erro.message 
            });
        }
    },

    // API: Busca usuário por ID (para modal de detalhes)
    buscarPorId: async (req, res) => {
        try {
            const { id } = req.params;

            const usuario = await db('usuarios as u')
                .leftJoin('pessoa_fisica as pf', 'u.cd_pessoa', 'pf.cd_pessoa_fisica')
                .where('u.cd_usuario', id)
                .select(
                    'u.*',
                    'pf.nm_pessoa_fisica',
                    'pf.nr_cpf as cpf_pessoa',
                    'pf.nr_identidade',
                    'pf.dt_nascimento',
                    'pf.ie_sexo',
                    'pf.nr_telefone_celular',
                    'pf.ds_email',
                    'pf.ds_endereco',
                    'pf.nr_endereco',
                    'pf.ds_bairro',
                    'pf.ds_municipio',
                    'pf.sg_estado'
                )
                .first();

            if (!usuario) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Usuário não encontrado' 
                });
            }

            res.json({ 
                success: true, 
                data: usuario 
            });

        } catch (erro) {
            console.error('Erro ao buscar usuário:', erro);
            res.status(500).json({ 
                success: false, 
                message: 'Erro ao buscar usuário',
                error: erro.message 
            });
        }
    }
};
