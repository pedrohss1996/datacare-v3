// server.js
require('dotenv').config();
const http = require('http'); // NECESSÁRIO PARA O SOCKET.IO
const app = require('./src/app');
const { Server } = require('socket.io'); 

const PORT = process.env.PORT || 3000;

// 1. Criação do Servidor HTTP explícito (acoplando o Express)
const server = http.createServer(app);

// 2. Configuração do Socket.io
const io = new Server(server, {
    cors: {
        origin: "*", // Em produção, restrinja isso para o domínio do seu front
        methods: ["GET", "POST"]
    }
});

// 3. Compartilhando a instância do 'io' com toda a aplicação
// Isso permite usar req.io lá nos controllers
app.set('io', io);

// 4. Eventos Globais do Socket (Para debug)
io.on('connection', (socket) => {
    
    socket.on('disconnect', () => {
    });
});

// 5. Inicia o servidor
// ATENÇÃO: Usamos server.listen aqui, e não app.listen
server.listen(PORT, () => {
    //console.log(`🚀 Servidor DataCare rodando em http://localhost:${PORT}`);
    //console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

// --- ALTERAÇÃO CIRÚRGICA: Proteção contra quedas inesperadas ---

// 1. Captura erros de código síncrono que não foram tratados
process.on('uncaughtException', (err) => {
    console.error('ERRO CRÍTICO (Uncaught Exception):', err);
    // Em produção, o ideal é logar e reiniciar o processo.
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