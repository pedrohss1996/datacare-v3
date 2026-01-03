// src/routes/index.routes.js
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.render('pages/index', {
        title: 'Home - DataCare',
        user: req.user // Passa o usuário (ou undefined se não tiver)
    });
});

module.exports = router;