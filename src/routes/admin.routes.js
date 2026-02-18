const express = require('express');
const router = express.Router();
const loginRequired = require('../middlewares/loginRequired');
const adminController = require('../controllers/adminController');

// Apenas admins podem acessar (cd_perfil_inicial = 3)
const adminRequired = (req, res, next) => {
  const user = req.user || req.session?.user;
  if (!user) return res.redirect('/login');
  const perfil = user.cd_perfil_inicial ?? user.cd_perfil_inicial;
  const nome = String(user.nm_usuario || user.name || '').toLowerCase();
  if (perfil === 3 || perfil === '3' || nome === 'pedrosantos') return next();
  return res.status(403).render('pages/404', { title: 'Acesso negado', user });
};

router.get('/admin', loginRequired, adminRequired, adminController.index);
router.post('/admin/grupos/salvar', loginRequired, adminRequired, adminController.salvarGrupo);
router.post('/admin/grupos/excluir/:id', loginRequired, adminRequired, adminController.excluirGrupo);
router.post('/admin/grupos/:id/modulos', loginRequired, adminRequired, adminController.atualizarModulosGrupo);
router.post('/admin/usuarios/:id/grupo', loginRequired, adminRequired, adminController.atualizarGrupoUsuario);

module.exports = router;
