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
const rotaChat = require('./routes/chat.routes');
const indexRoutes = require('./routes/index.routes');
const authRoutes = require('./routes/auth.routes');
const rotasPessoas = require('./routes/pessoas.routes');
const rotaIndicadores = require('./routes/indicadores.routes');
const rotaTasy = require('./routes/tasy.routes')
const rotaAdminChat = require('./routes/admin_chat.routes');

// ---- Criador de Pagina IA ----
const analyticsRoutes = require('./routes/analytics.routes');
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

// 4.1 Configuração de Sessão (Login)
app.use(session({
    secret: process.env.SESSION_SECRET || 'segredo-super-secreto-mudar-em-prod', 
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, 
        maxAge: 1000 * 60 * 60 * 24 
    }
}));

// 4.2 Middleware para disponibilizar o 'user' em todas as views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    req.user = req.session.user || null; 
    next();
});

// [NOVO] 4.3 Middleware do Socket.io 
// Recupera o 'io' que salvamos no server.js e coloca na requisição
app.use((req, res, next) => {
    req.io = req.app.get('io');
    next();
});

// 5. Rotas
app.use('/', authRoutes);      
app.use('/', rotasPessoas);    
app.use('/', rotaIndicadores);
app.use('/', indexRoutes); 
//app.use('/', whatsappRoutes);
app.use('/', rotaChat);
app.use('/', rotaTasy);
app.use('/', rotaAdminChat);
app.use('/', analyticsRoutes);


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