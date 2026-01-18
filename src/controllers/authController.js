const jwt = require('jsonwebtoken');
const ldap = require('ldapjs');
const db = require('../infra/database/connection');
require('dotenv').config();

module.exports = {
    renderizarLogin: (req, res) => {
        if (req.session && req.session.user && req.session.user.token) {
            return res.redirect('/');
        }
        res.render('pages/auth/login', {
            title: 'Login - DataCare',
            layout: 'layouts/auth',
            erro: null
        });
    },

    login: async (req, res) => {
        let { usuario, senha } = req.body;

        if (usuario.includes('@')) usuario = usuario.split('@')[0];

        // --- Lógica LDAP ---
        const client = ldap.createClient({ url: process.env.LDAP_URL, timeout: 5000, connectTimeout: 5000 });
        client.on('error', (err) => console.error('LDAP Error:', err.message));
        
        const dnMappings = [
            `uid=${usuario},ou=people,dc=intranet,dc=arh,dc=com,dc=br`,
            `uid=${usuario},ou=people,dc=arh,dc=com,dc=br`
        ];

        try {
            // 1. Tenta Autenticar no LDAP
            let ldapSuccess = false;
            for (const dn of dnMappings) {
                try {
                    await new Promise((resolve, reject) => {
                        client.bind(dn, senha, (err) => err ? reject(err) : resolve(true));
                    });
                    ldapSuccess = true;
                    break;
                } catch (e) {}
            }
            if (!ldapSuccess) throw new Error('Credenciais inválidas.');
            client.unbind();

            // 2. Busca no Postgres (Tabela usuarios SIMPLES)
            // Como a coluna ds_usuario já está aqui, não precisamos de JOIN!
            const userDb = await db('usuarios')
                .whereRaw('UPPER(nm_usuario) = ?', [usuario.toUpperCase()])
                .first();

            if (!userDb) {
                return res.render('pages/auth/login', {
                    title: 'Login - DataCare',
                    layout: 'layouts/auth',
                    erro: 'Usuário sem cadastro no DataCare.'
                });
            }

            // 3. Define o Nome para Exibição (AQUI ESTÁ A CHAVE 🔑)
            // Priorizamos 'ds_usuario' (Marlon Braga) > 'nm_usuario' (Login) > 'Usuário'
            const nomeParaSessao = userDb.ds_usuario || userDb.nm_usuario || 'Usuário';

            // 4. Gera Token
            const token = jwt.sign({
                id: userDb.cd_usuario,
                username: userDb.nm_usuario,
                role: 'TI'
            }, process.env.JWT_SECRET, { expiresIn: '8h' });

            // 5. Salva na Sessão
            req.session.user = {
                id: userDb.cd_usuario,
                name: nomeParaSessao, // <--- Vai salvar o conteúdo de ds_usuario
                token: token
            };

            // 6. Salva e Redireciona
            req.session.save(() => {
                return res.redirect('/');
            });

        } catch (error) {
            try { client.unbind(); } catch(e) {}
            console.error('Falha Auth:', error.message);
            return res.render('pages/auth/login', {
                title: 'Login - DataCare',
                layout: 'layouts/auth',
                erro: 'Usuário ou senha incorretos.'
            });
        }
    },


    logout: (req, res) => {
        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            res.redirect('/login');
        });
    }
};