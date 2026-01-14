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

        // Limpeza básica: se o usuário digitou o email completo, removemos o dominio
        // para usar apenas o uid na montagem do DN LDAP.
        if (usuario.includes('@')) {
            usuario = usuario.split('@')[0];
        }

        const client = ldap.createClient({
            url: process.env.LDAP_URL,
            timeout: 5000,
            connectTimeout: 5000
        });

        client.on('error', (err) => console.error('LDAP Client Error:', err.message));

        // --- DEFINIÇÃO DAS BASES POSSÍVEIS ---
        // Vamos tentar autenticar nestes caminhos, em ordem.
        const dnMappings = [
            // 1. Tenta na Intranet (intranet.arh.com.br)
            `uid=${usuario},ou=people,dc=intranet,dc=arh,dc=com,dc=br`,
            
            // 2. Tenta na Raiz (arh.com.br) - O que validamos no teste anterior
            `uid=${usuario},ou=people,dc=arh,dc=com,dc=br`
        ];

        // Função auxiliar para tentar o Bind em uma lista de DNs
        const tentarAutenticacao = async () => {
            // Percorre todas as possibilidades de DN
            for (const dn of dnMappings) {
                try {
                    console.log(`--- Tentando autenticar em: ${dn} ---`);
                    
                    await new Promise((resolve, reject) => {
                        client.bind(dn, senha, (err) => {
                            if (err) return reject(err);
                            resolve(true);
                        });
                    });
                    
                    // Se chegou aqui, é sucesso!
                    console.log('✅ SUCESSO! Login validado no DN:', dn);
                    return true; 

                } catch (error) {
                    // Apenas loga que falhou neste domínio, mas NÃO joga o erro pra fora.
                    // O loop vai continuar para a próxima tentativa.
                    console.log(`❌ Falha na tentativa (${dn}): ${error.message}`);
                }
            }

            // Se o loop terminou e a função não retornou "true", então falhou em todos.
            throw new Error('Credenciais inválidas em todos os domínios configurados.');
        };

        try {
            // 1. Executa a cascata de tentativas LDAP
            await tentarAutenticacao();
            client.unbind();

            // 2. Login LDAP OK -> Busca dados no DataCare (Banco SQL)
            // Aqui usamos o login limpo (sem @dominio) para buscar
            const userDb = await db('usuarios').where({ nm_usuario: usuario }).first();

            if (!userDb) {
                return res.render('pages/auth/login', {
                    title: 'Login - DataCare',
                    layout: 'layouts/auth',
                    erro: 'Usuário autenticado na rede, mas sem cadastro no DataCare.'
                });
            }

            // 3. Gera Token
            const token = jwt.sign({
                id: userDb.cd_usuario,
                username: userDb.ds_usuario,
                role: 'TI' // Placeholder
            }, process.env.JWT_SECRET, { expiresIn: '8h' });

            req.session.user = {
                id: userDb.cd_usuario,
                name: userDb.nm_usuario || userDb.ds_usuario || 'Usuário',
                token: token
            };

            return res.redirect('/');

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