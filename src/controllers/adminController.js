/**
 * adminController - Painel de Administração completo
 * - Usuários: cadastro, edição, vinculação a grupos
 * - Grupos: CRUD
 * - Módulos: liberação por grupo (Analytics, Connect, Quality, Staff)
 */
const db = require('../infra/database/connection');

module.exports = {
  /** Página principal do painel admin */
  index: async (req, res) => {
    try {
      const [usuarios, grupos, modulos] = await Promise.all([
        db('usuarios as u')
          .leftJoin('admin_grupos as g', 'u.grupo_id', 'g.id')
          .leftJoin('pessoa_fisica as pf', 'u.cd_pessoa', 'pf.cd_pessoa_fisica')
          .select(
            'u.cd_usuario',
            'u.nm_usuario',
            'u.ds_usuario',
            'u.ie_situacao',
            'u.grupo_id',
            'u.dt_criacao',
            'g.nome as grupo_nome',
            'pf.nr_cpf',
            'pf.ds_email'
          )
          .orderBy('u.dt_criacao', 'desc'),
        db('admin_grupos').select('*').orderBy('ordem').catch(() => []),
        db('admin_modulos').select('*').where('ativo', true).orderBy('ordem').catch(() => []),
      ]);

      const grupoModulos = await db('admin_grupo_modulos').select('*').catch(() => []);
      const gmMap = {};
      grupoModulos.forEach((gm) => {
        if (!gmMap[gm.grupo_id]) gmMap[gm.grupo_id] = [];
        gmMap[gm.grupo_id].push(gm.modulo_id);
      });

      res.render('pages/admin/index', {
        title: 'Administração - DataCare',
        layout: 'layouts/main',
        user: req.user,
        usuarios,
        grupos,
        modulos,
        grupoModulosMap: gmMap,
      });
    } catch (erro) {
      console.error('Erro admin index:', erro);
      res.status(500).render('pages/500', { error: erro, user: req.user });
    }
  },

  /** POST: Salvar/atualizar grupo */
  salvarGrupo: async (req, res) => {
    const { id, nome, descricao, ordem } = req.body;
    try {
      if (id) {
        await db('admin_grupos').where({ id }).update({
          nome: nome?.trim(),
          descricao: descricao?.trim() || null,
          ordem: parseInt(ordem) || 0,
          updated_at: new Date(),
        });
      } else {
        await db('admin_grupos').insert({
          nome: nome?.trim(),
          descricao: descricao?.trim() || null,
          ordem: parseInt(ordem) || 0,
        });
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },

  /** POST: Excluir grupo */
  excluirGrupo: async (req, res) => {
    const { id } = req.params;
    try {
      const count = await db('usuarios').where('grupo_id', id).count('* as c').first();
      if (parseInt(count?.c || 0) > 0) {
        return res.status(400).json({ success: false, message: 'Existem usuários vinculados a este grupo.' });
      }
      await db('admin_grupo_modulos').where('grupo_id', id).del();
      await db('admin_grupos').where('id', id).del();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },

  /** POST: Atualizar módulos do grupo */
  atualizarModulosGrupo: async (req, res) => {
    const grupo_id = req.params.id || req.body.grupo_id;
    const { modulo_ids } = req.body;
    try {
      await db('admin_grupo_modulos').where('grupo_id', grupo_id).del();
      const ids = Array.isArray(modulo_ids) ? modulo_ids : (modulo_ids ? [modulo_ids] : []);
      for (const mod_id of ids) {
        await db('admin_grupo_modulos').insert({ grupo_id, modulo_id: mod_id });
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },

  /** POST: Atualizar grupo do usuário */
  atualizarGrupoUsuario: async (req, res) => {
    const { id } = req.params;
    const { grupo_id } = req.body;
    try {
      await db('usuarios').where('cd_usuario', id).update({
        grupo_id: parseInt(grupo_id) || 2,
      });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
};
