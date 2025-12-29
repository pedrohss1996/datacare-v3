const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.redirect('/login');
});

// ALTERADO: Rota agora chama-se '/main'
router.get('/main', (req, res) => {
    res.render('pages/main', { 
        title: 'Menu Principal - Hospital Core',
        user: { name: 'Marlon Braga', role: 'Administrador TI' },
        layout: 'layouts/main' // Usa o layout com Navbar
    });
});

module.exports = router;