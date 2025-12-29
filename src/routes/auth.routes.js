// src/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController.js');

router.get('/login', authController.renderLogin);
router.post('/login', authController.handleLogin);

module.exports = router;