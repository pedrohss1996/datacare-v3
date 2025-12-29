// server.js
require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

// Tratamento de erros não capturados para evitar crash silencioso
process.on('SIGTERM', () => {
    server.close(() => {
        console.log('Servidor encerrado pelo processo.');
    });
});