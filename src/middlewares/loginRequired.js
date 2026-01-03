module.exports = (req, res, next) => {
    // Verifica se existe um usuário salvo na sessão
    if (req.session && req.session.user) {
        // Se tiver, deixa passar para a próxima função (o controller)
        return next();
    }
    
    return res.redirect('/login');
};