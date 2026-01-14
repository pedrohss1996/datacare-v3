// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
    // =================================================================
    // 🔓 LISTA DE EXCEÇÕES (ROTAS PÚBLICAS)
    // Aqui definimos rotas que NÃO precisam de login (Webhooks, APIs externas)
    // =================================================================
    const rotasPublicas = [
        '/api/webhook/zapi',       // O Webhook da Z-API
        '/api/teste/novo-paciente' // Sua rota de teste
    ];

    // Se a URL acessada estiver na lista, deixa passar direto!
    if (rotasPublicas.some(rota => req.path.includes(rota))) {
        return next();
    }

    // =================================================================
    // 🔒 VERIFICAÇÃO DE SEGURANÇA PADRÃO
    // Daqui pra baixo, só passa quem tem login
    // =================================================================

    // 1. Verifica se a sessão e o token existem
    if (!req.session || !req.session.user || !req.session.user.token) {
        // Se for uma chamada de API (AJAX/Fetch) não deve redirecionar, deve dar erro 401
        if (req.headers['accept'] && req.headers['accept'].includes('application/json')) {
             return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
        }
        return res.redirect('/login');
    }

    const token = req.session.user.token;

    // 2. Verifica a validade do Token JWT
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error('Token inválido ou expirado:', err.message);
            
            // Limpa tudo e força o login novamente
            req.session.destroy(() => {
                res.clearCookie('connect.sid'); 
                return res.redirect('/login');
            });
        } else {
            // 3. Token Válido: Injeta os dados do usuário na requisição
            req.user = decoded; 
            return next();
        }
    });
};