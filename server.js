// server.js
require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

// --- ALTERAÇÃO CIRÚRGICA: Proteção contra quedas inesperadas ---

// 1. Captura erros de código síncrono que não foram tratados
process.on('uncaughtException', (err) => {
    console.error('ERRO CRÍTICO (Uncaught Exception):', err);
    // Em produção, o ideal é logar e reiniciar o processo, mas em dev isso ajuda a ver o erro.
});

// 2. Captura erros de Promises (Banco de dados, APIs) que esquecemos do .catch()
process.on('unhandledRejection', (reason, promise) => {
    console.error('PROMISE REJEITADA NÃO TRATADA:', reason);
});

// 3. Encerramento gracioso (SIGTERM)
process.on('SIGTERM', () => {
    server.close(() => {
        console.log('Servidor encerrado pelo processo.');
    });
});