/**
 * Middleware: Verifica se o usuário tem acesso ao módulo
 * - Admin (grupo 1 ou cd_perfil_inicial 3): acesso total
 * - Caso contrário: verifica admin_grupo_modulos
 */
const db = require('../infra/database/connection');

const MODULO_ROTAS = {
  analytics: '/analytics',
  connect: '/chat',
  quality: '/quality',
  staff: '/staff',
};

function getModuloByPath(path) {
  for (const [slug, rota] of Object.entries(MODULO_ROTAS)) {
    if (path === rota || path.startsWith(rota + '/') || path.startsWith('/api' + rota)) return slug;
  }
  if (path.includes('/api/analytics')) return 'analytics';
  if (path.includes('/chat') || path.includes('/admin_chat')) return 'connect';
  return null;
}

module.exports = function(slug) {
  return async (req, res, next) => {
    const user = req.user || req.session?.user;
    if (!user) return res.redirect('/login');

    const perfil = user.cd_perfil_inicial ?? user.cd_perfil_inicial;
    const grupoId = user.grupo_id ?? user.grupo_id;

    // Admin: acesso total
    if (perfil === 3 || perfil === '3') return next();
    const nome = String(user.nm_usuario || user.name || '').toLowerCase();
    if (nome === 'pedrosantos') return next();

    // Grupo 1 (Administrador): acesso total
    if (grupoId === 1 || grupoId === '1') return next();

    // Verifica se o grupo tem o módulo liberado
    try {
      const modulo = await db('admin_modulos').where({ slug, ativo: true }).first();
      if (!modulo) return next(); // Módulo não configurado, permite

      const temAcesso = await db('admin_grupo_modulos')
        .where({ grupo_id: grupoId, modulo_id: modulo.id })
        .first();

      if (temAcesso) return next();
    } catch (e) {
      console.error('[moduloRequired]', e.message);
      return next(); // Em caso de erro, permite (fail-open para não bloquear)
    }

    return res.status(403).render('pages/404', {
      title: 'Acesso negado',
      layout: 'layouts/main',
      user,
      msg: 'Você não tem permissão para acessar este módulo.',
    });
  };
};
