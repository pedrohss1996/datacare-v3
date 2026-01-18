// src/middlewares/loginRequired.js
module.exports = (req, res, next) => {
    if (req.session && req.session.user) {

        req.user = req.session.user;
        res.locals.user = req.session.user;

        return next();
    }
    
    // Se não tiver sessão, manda pro login
    return res.redirect('/login');
};