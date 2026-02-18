const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware.js'); // O arquivo novo

// Rotas Públicas (Não usa middleware)
router.get('/login', authController.renderizarLogin);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

// Rotas Protegidas (SaaS DataCare)
// Todas as rotas abaixo desta linha exigirão Token JWT válido
router.use(authMiddleware); 

router.get('/', (req, res) => {
    const user = req.session?.user || req.user;
    res.render('pages/index', { 
        user,
        title: 'DataCare - Central de Módulos'
    });
});

module.exports = router;