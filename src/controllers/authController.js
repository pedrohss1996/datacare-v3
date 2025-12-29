// src/controllers/authController.js

exports.renderLogin = (req, res) => {
    res.render('pages/login', { 
        title: 'Acesso ao Sistema',
        layout: 'layouts/auth'
    });
};

exports.handleLogin = (req, res) => {
    // Lógica de login...
    console.log("Login efetuado:", req.body);
    
    // ALTERADO: Redireciona para a rota 'main'
    res.redirect('/main');
};