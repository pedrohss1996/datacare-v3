const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
    // 1. Primeira verificação: Tem sessão aberta?
    if (!req.session || !req.session.user || !req.session.user.token) {
        return res.redirect('/login');
    }

    // 2. Segunda verificação: O Token JWT dentro da sessão é válido?
    const token = req.session.user.token;

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            // Se cair aqui, o token expirou (passou das 8h) ou é inválido.
            console.log('Sessão expirada ou token inválido. Forçando logout.');
            
            // Destrói a sessão "podre" e manda pro login
            req.session.destroy(() => {
                res.clearCookie('connect.sid'); // Limpa cookie de sessão
                res.clearCookie('token');       // Limpa cookie de token (se existir)
                return res.redirect('/login');
            });
        } else {
            // 3. Sucesso! Token válido.
            // Opcional: Adiciona os dados decodificados (ex: { username: 'marlon' }) na requisição
            req.user = decoded; 
            
            return next(); // Pode passar.
        }
    });
};