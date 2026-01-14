// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
    // 1. Verifica se a sessão e o token existem
    if (!req.session || !req.session.user || !req.session.user.token) {
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
            // 3. Token Válido: Injeta os dados do usuário na requisição para uso posterior
            req.user = decoded; 
            return next();
        }
    });
};