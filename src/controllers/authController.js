const db = require('../infra/database/connection');
const bcrypt = require('bcryptjs');

module.exports = {
    // Exibe a tela de login
    renderizarLogin: (req, res) => {
        if (req.session.user) return res.redirect('/'); // Já está logado
        res.render('pages/auth/login', {
            title: 'Login - DataCare',
            layout: 'layouts/auth',
            erro: null
        });
    },

    // Processa o login
    login: async (req, res) => {
        const { usuario, senha } = req.body;

        try {
            // 1. Busca o usuário no banco (pelo login)
            const userEncontrado = await db('usuarios')
                .where({ nm_usuario: usuario }) // Ajuste se sua coluna for outra (ex: ds_login)
                .first();

            // 2. Se não achar usuário
            if (!userEncontrado) {
                return res.render('pages/auth/login', {
                    title: 'Login - DataCare',
                    layout: 'layouts/auth',
                    erro: 'Usuário ou senha incorretos.'
                });
            }

            // 3. Verifica a senha (Bcrypt)
            // userEncontrado.ds_senha deve ser o hash que salvamos no cadastro
            const senhaBate = await bcrypt.compare(senha, userEncontrado.ds_senha);

            if (!senhaBate) {
                return res.render('pages/auth/login', {
                    title: 'Login - DataCare',
                    layout: 'layouts/auth',
                    erro: 'Usuário ou senha incorretos.'
                });
            }

            // 4. Login Sucesso: Salva na sessão
            // Pegamos o nome real da pessoa fazendo um join se necessário, 
            // mas por enquanto vamos usar o ds_usuario que salvamos na tabela usuarios
            req.session.user = {
                id: userEncontrado.cd_usuario,
                name: userEncontrado.ds_usuario, // Nome exibido na tela
                role: 'TI' // Placeholder: depois pegamos do perfil real
            };

            // Redireciona para a Home
            res.redirect('/');

        } catch (erro) {
            console.error(erro);
            res.render('pages/auth/login', {
                title: 'Login - DataCare',
                layout: 'layouts/auth',
                erro: 'Erro interno ao tentar logar.'
            });
        }
    },

    // Faz logout
    logout: (req, res) => {
        // Destrói a sessão no servidor
        req.session.destroy((err) => {
            if (err) {
                console.error('Erro ao destruir sessão:', err);
            }
            
            // Opcional: Limpa o cookie no navegador explicitamente
            // O nome padrão do cookie do express-session é 'connect.sid'
            res.clearCookie('connect.sid'); 

            // Redireciona para o login
            res.redirect('/login');
        });
    }
};