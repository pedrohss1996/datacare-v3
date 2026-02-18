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

        try {
            // 1. Busca usuário no PostgreSQL primeiro
            const userDb = await db('usuarios')
                .whereRaw('UPPER(nm_usuario) = ?', [usuario.toUpperCase()])
                .first();

            if (!userDb) {
                return res.render('pages/auth/login', {
                    title: 'Login - DataCare',
                    layout: 'layouts/auth',
                    erro: 'Usuário não encontrado.'
                });
            }

            let autenticado = false;

            // 2. Tenta autenticar no LDAP primeiro (para usuários do Zimbra)
            try {
                const client = ldap.createClient({ 
                    url: process.env.LDAP_URL, 
                    timeout: 3000, 
                    connectTimeout: 3000 
                });
                
                client.on('error', (err) => console.log('LDAP não disponível, tentando autenticação local'));
                
                const dnMappings = [
                    `uid=${usuario},ou=people,dc=intranet,dc=arh,dc=com,dc=br`,
                    `uid=${usuario},ou=people,dc=arh,dc=com,dc=br`
                ];

                for (const dn of dnMappings) {
                    try {
                        await new Promise((resolve, reject) => {
                            client.bind(dn, senha, (err) => err ? reject(err) : resolve(true));
                        });
                        autenticado = true;
                        console.log(`✅ Autenticado via LDAP: ${usuario}`);
                        break;
                    } catch (e) {}
                }
                
                client.unbind();
            } catch (ldapError) {
                console.log('LDAP falhou, tentando autenticação local');
            }

            // 3. Se LDAP falhou, tenta autenticação local (senha no PostgreSQL)
            if (!autenticado && userDb.ds_senha) {
                const bcrypt = require('bcryptjs');
                const senhaValida = await bcrypt.compare(senha, userDb.ds_senha);
                
                if (senhaValida) {
                    autenticado = true;
                    console.log(`✅ Autenticado via senha local: ${usuario}`);
                } else {
                    console.log(`❌ Senha local inválida: ${usuario}`);
                }
            }

            // 4. Se não autenticou por nenhum método, retorna erro
            if (!autenticado) {
                return res.render('pages/auth/login', {
                    title: 'Login - DataCare',
                    layout: 'layouts/auth',
                    erro: 'Usuário ou senha inválidos.'
                });
            }

            // 5. Define o Nome para Exibição
            const nomeParaSessao = userDb.ds_usuario || userDb.nm_usuario || 'Usuário';

            // 6. Gera Token
            const token = jwt.sign({
                id: userDb.cd_usuario,
                username: userDb.nm_usuario,
                role: 'TI'
            }, process.env.JWT_SECRET, { expiresIn: '8h' });

            // 7. Salva na Sessão
            req.session.user = {
                id: userDb.cd_usuario,
                cd_usuario: userDb.cd_usuario,
                name: nomeParaSessao,
                nm_usuario: userDb.nm_usuario,
                ds_usuario: userDb.ds_usuario,
                cpf: userDb.nr_cpf,
                cd_perfil_inicial: userDb.cd_perfil_inicial,
                grupo_id: userDb.grupo_id,
                token: token
            };

            // 8. Salva e Redireciona
            req.session.save(() => {
                return res.redirect('/');
            });

        } catch (error) {
            console.error('Erro no login:', error.message);
            return res.render('pages/auth/login', {
                title: 'Login - DataCare',
                layout: 'layouts/auth',
                erro: 'Erro ao processar login. Tente novamente.'
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