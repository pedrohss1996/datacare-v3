const patientRepository = require('../modules/patients/patientRepository');

exports.renderCreate = (req, res) => {
    res.render('pages/patients/create', {
        title: 'Novo Paciente - DataCare',
        layout: 'layouts/main',
        user: req.user || { name: 'Marlon Braga', role: 'Recepção' }, // Mock seguro
        success: req.query.success // Para mostrar mensagem depois
    });
};

exports.store = async (req, res) => {
    try {
        const patientData = req.body;
        
        // Simples validação manual
        if(!patientData.name || !patientData.cpf) {
            return res.send('Erro: Nome e CPF são obrigatórios');
        }

        await patientRepository.create(patientData);
        
        // Redireciona para a mesma página com mensagem de sucesso
        res.redirect('/patients/new?success=true');
        
    } catch (error) {
        console.error(error);
        res.send('Erro ao cadastrar paciente: ' + error.message);
    }
};