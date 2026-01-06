// src/app.js
require('dotenv').config(); 

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cors = require('cors');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');

// --- Importação de Rotas ---
const indexRoutes = require('./routes/index.routes');
const authRoutes = require('./routes/auth.routes');
const rotasPessoas = require('./routes/pessoas.routes');
const rotaIndicadores = require('./routes/indicadores.routes');
const rotaIndicadoresIA = require('./routes/ia.routes');
const rotaQuerisIA = require('./routes/queries.routes');

// Inicializa o app
const app = express();

// 1. Configurações de View Engine
app.use(expressLayouts);
app.set('layout', './layouts/main'); 
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 2. Middlewares Globais
app.use(helmet({
    contentSecurityPolicy: false, 
}));
app.use(compression()); 
app.use(cors()); 
app.use(morgan('dev')); 

// 3. Parsers 
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 

// 4. Arquivos Estáticos
app.use(express.static(path.join(__dirname, '../public')));

// --- TODO: FUTURO ---
// Aqui entrará o middleware de Sessão (express-session) para o Login funcionar.
// Por enquanto, seguimos sem ele.

// 4.1 Configuração de Sessão (Login)
app.use(session({
    secret: process.env.SESSION_SECRET || 'segredo-super-secreto-mudar-em-prod', // Chave para assinar o cookie
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Em localhost deve ser false. Em HTTPS (produção) deve ser true.
        maxAge: 1000 * 60 * 60 * 24 // 1 dia de duração
    }
}));

// 4.2 Middleware para disponibilizar o 'user' em todas as views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    req.user = req.session.user || null; // Compatibilidade com suas rotas antigas
    next();
});

// 5. Rotas
// A ordem aqui está PERFEITA (Específico -> Genérico)
app.use('/', authRoutes);      
app.use('/', rotasPessoas);    
app.use('/', rotaIndicadores);
app.use('/', indexRoutes); 
app.use('/', rotaIndicadoresIA)
app.use('/', rotaQuerisIA)   

// 6. Tratamento de Erros
app.use((req, res, next) => {
    res.status(404).render('pages/404', { 
        title: 'Página não encontrada',
        layout: 'layouts/main',
        user: req.user || null 
    });
});

app.use((err, req, res, next) => {
    console.error('ERRO CRÍTICO:', err.stack);
    res.status(500).render('pages/500', { 
        title: 'Erro Interno', 
        layout: 'layouts/main',
        error: process.env.NODE_ENV === 'development' ? err : {}, 
        user: req.user || null
    });
});

module.exports = app;