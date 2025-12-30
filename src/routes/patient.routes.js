const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');

// Rota para mostrar o formulário
router.get('/patients/new', patientController.renderCreate);

router.post('/patients', patientController.store);

module.exports = router;