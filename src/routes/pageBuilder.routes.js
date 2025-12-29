// src/routes/pageBuilder.routes.js
const express = require('express');
const router = express.Router();
const pageBuilderController = require('../controllers/pageBuilderController');

router.get('/page-builder', pageBuilderController.renderBuilder);
router.post('/page-builder/generate', pageBuilderController.generateCode);

module.exports = router;