// src/controllers/authController.js

exports.renderLogin = (req, res) => {
    // Passamos 'layout: false' para que ele renderize APENAS o arquivo login.ejs,
    // sem incluir o cabeçalho e menu lateral do sistema principal.
    res.render('pages/auth/login', {
        title: 'Login - DataCare',
        layout: false 
    });
};
exports.handleLogin = (req, res) => {
    // Lógica de login...
    console.log("Login efetuado:", req.body);
    
    // ALTERADO: Redireciona para a rota 'main'
    res.redirect('/main');
};