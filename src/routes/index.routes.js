// src/routes/index.routes.js
const express = require('express');
const router = express.Router();
const loginRequired = require('../middlewares/loginRequired');

router.get('/', loginRequired, (req, res) => {
    
    const user = req.user || {};

    res.render('pages/index', {
        title: 'Home - DataCare',
        user: user
    });
});

module.exports = router;