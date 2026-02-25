/**
 * Módulo ai-dashboard - Exporta rotas para registro no app principal.
 * Desacoplado: usa PostgreSQL existente, auth existente, sem alterar código fora do módulo.
 */
const aiDashboardRoutes = require('./routes/ai-dashboard.routes');

module.exports = {
  routes: aiDashboardRoutes,
};
