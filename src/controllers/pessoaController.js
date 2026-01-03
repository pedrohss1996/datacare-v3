const db = require('../infra/database/connection');
const bcrypt = require('bcryptjs'); // Importante para segurança

module.exports = {
    renderizarCadastro: (req, res) => {
        res.render('pages/pessoas/cadastro', {
            title: 'Cadastro Completo',
            layout: 'layouts/main',
            user: req.user || { name: 'Admin', role: 'TI' },
            dados: {}, // Envia vazio para não dar erro no EJS
            erro: null
        });
    },

    cadastrar: async (req, res) => {
        const transacao = await db.transaction();

        // Extrai dados do corpo da requisição
        const { 
            nome, dt_nascimento, sexo, estado_civil,
            cd_nacionalidade, altura, peso, cd_religiao, cd_profissao,
            cpf, rg, orgao_rg, prontuario,
            telefone, email,
            cep, endereco, numero, complemento, bairro, municipio, uf, ibge,
            criar_usuario, modal_usuario, modal_senha, modal_perfil 
        } = req.body;

        try {
            // --- VALIDAÇÕES PRÉVIAS (Fail Fast) ---
            if (!nome) throw new Error('O campo Nome é obrigatório.');
            
            // Tratamento de CPF e CEP (Remove tudo que não for número)
            const cpfLimpo = cpf ? cpf.replace(/\D/g, '') : null;
            const cepLimpo = cep ? cep.replace(/\D/g, '') : null;

            // --- 1. INSERÇÃO DA PESSOA FÍSICA ---
            const [pessoaCriada] = await transacao('pessoa_fisica').insert({
                nm_pessoa_fisica: nome.toUpperCase().trim(),
                nr_cpf: cpfLimpo,
                nr_identidade: rg ? rg.toUpperCase().trim() : null,
                ds_orgao_emissor_ci: orgao_rg ? orgao_rg.toUpperCase() : null,
                nr_prontuario: prontuario || null, 
                dt_nascimento: dt_nascimento || null,
                ie_sexo: sexo || null,
                ie_estado_civil: estado_civil || null,
                cd_nacionalidade: cd_nacionalidade || null,
                cd_religiao: cd_religiao || null,
                cd_profissao: cd_profissao || null,
                qt_altura_cm: altura || null,
                qt_peso: peso || null,
                nr_telefone_celular: telefone || null,
                ds_email: email ? email.toLowerCase().trim() : null, // Email geralmente é minúsculo
                cd_cep: cepLimpo,
                ds_endereco: endereco ? endereco.toUpperCase() : null,
                nr_endereco: numero ? numero.toUpperCase() : null,
                ds_complemento: complemento ? complemento.toUpperCase() : null,
                ds_bairro: bairro ? bairro.toUpperCase() : null,
                ds_municipio: municipio ? municipio.toUpperCase() : null,
                sg_estado: uf || null,
                cd_municipio_ibge: ibge || null,
                dt_cadastro: new Date()
            }).returning('cd_pessoa_fisica'); // Retorna o ID inserido

            // Verifica se o ID retornou corretamente (dependendo do banco/driver)
            const idPessoa = pessoaCriada?.cd_pessoa_fisica || pessoaCriada; 

            // --- 2. INSERÇÃO DO USUÁRIO (Opcional) ---
            if (criar_usuario === 'on') {
                if (!modal_usuario || !modal_senha) {
                    throw new Error('Para criar usuário, login e senha são obrigatórios.');
                }

                // Criptografia da senha (Segurança)
                const salt = await bcrypt.genSalt(10);
                const senhaHash = await bcrypt.hash(modal_senha, salt);

                await transacao('usuarios').insert({
                    nm_usuario: modal_usuario.trim(), // Login não deve ter espaços nas pontas
                    ds_usuario: nome.toUpperCase(),
                    ds_senha: senhaHash, // Salva o Hash, NUNCA a senha em texto plano
                    cd_pessoa: idPessoa, 
                    cd_perfil_inicial: parseInt(modal_perfil) || null,
                    ie_situacao: 'A',
                    dt_criacao: new Date()
                });
            }

            // Sucesso: Confirma a transação e redireciona
            await transacao.commit();
            res.redirect('/pessoas?sucesso=true');

        } catch (erro) {
            // Erro: Desfaz tudo no banco
            await transacao.rollback();
            console.error('Erro no cadastro:', erro);
            
            // Tratamento da mensagem de erro amigável
            let msg = erro.message || 'Erro ao salvar os dados.';
            
            if (erro.code === '23505') { // Código Postgres para Unique Violation
                 if(erro.detail?.includes('nr_cpf')) msg = 'Este CPF já está cadastrado.';
                 if(erro.detail?.includes('nr_prontuario')) msg = 'Este Prontuário já existe.';
                 if(erro.detail?.includes('nm_usuario')) msg = 'Este Login de usuário já está em uso.';
            } else if (erro.code === '22P02') {
                msg = 'Verifique os campos numéricos (Peso, Altura, etc).';
            }

            // RE-RENDERIZAÇÃO (UX):
            // Devolve o usuário para o formulário COM os dados que ele preencheu e o erro
            res.render('pages/pessoas/cadastro', {
                title: 'Cadastro Completo',
                layout: 'layouts/main',
                user: req.user || { name: 'Admin', role: 'TI' },
                erro: msg,       // Passa a mensagem de erro para o front
                dados: req.body  // Passa os dados preenchidos para não perder
            });
        }
    },

    listar: async (req, res) => {
        try {
            // Busca as pessoas no banco (ordem decrescente para ver o último criado primeiro)
            const pessoas = await db('pessoa_fisica')
                .select('cd_pessoa_fisica', 'nm_pessoa_fisica', 'nr_cpf', 'nr_telefone_celular', 'ds_email')
                .orderBy('cd_pessoa_fisica', 'desc');

            res.render('pages/pessoas/lista', {
                title: 'Listagem de Pessoas',
                layout: 'layouts/main',
                user: req.user || null,
                pessoas: pessoas,
                // Verifica se veio o parametro ?sucesso=true na URL
                mensagem: req.query.sucesso ? 'Cadastro realizado com sucesso!' : null
            });

        } catch (erro) {
            console.error(erro);
            res.status(500).send('Erro ao buscar lista de pessoas.');
        }
    }
};