// src/app.js
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cors = require('cors');
const expressLayouts = require('express-ejs-layouts'); // <--- 1. ADICIONE ISSO

// Inicializa o app
const app = express();

// 1. Configurações de View Engine (EJS)
app.use(expressLayouts); // <--- 2. ADICIONE ISSO (Antes de setar a view engine)
app.set('layout', './layouts/main'); // <--- 3. Define o layout padrão
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 2. Middlewares de Segurança e Performance
// Helmet ajuda a proteger headers HTTP (ajustado para permitir scripts inline do EJS se necessário)
app.use(helmet({
    contentSecurityPolicy: false, // Desativado temporariamente para facilitar dev, ativar em prod
}));
app.use(compression()); // Compacta o HTML/CSS enviado (Gzip)
app.use(cors());

// 3. Middlewares de Parser e Log
app.use(express.urlencoded({ extended: true })); // <--- ISSO É OBRIGATÓRIO PARA FORMULÁRIOS
app.use(express.json());
app.use(morgan('dev')); // Log de requisições

// 4. Arquivos Estáticos (CSS, Imagens, JS do cliente)
app.use(express.static(path.join(__dirname, '../public')));

// 5. Rotas (Placeholder - vamos criar depois)
const indexRoutes = require('./routes/index.routes');
const authRoutes = require('./routes/auth.routes');
const pageBuilderRoutes = require('./routes/pageBuilder.routes');
const patientRoutes = require('./routes/patient.routes');

app.use('/', indexRoutes);
app.use('/', authRoutes);
app.use('/', pageBuilderRoutes);
app.use('/', patientRoutes);

// 6. Handler de Erro Global (Sempre o último)
app.use((req, res, next) => {
    res.status(404).render('pages/404', { title: 'Página não encontrada' });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('pages/500', { 
        title: 'Erro Interno', 
        error: process.env.NODE_ENV === 'development' ? err : {} 
    });
});

module.exports = app;