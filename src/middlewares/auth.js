module.exports = (req, res, next) => {
    if (req.session && req.session.user) {
        return next(); // Tem crachá? Passa.
    }
    return res.redirect('/login'); // Não tem? Vai pro login.
};