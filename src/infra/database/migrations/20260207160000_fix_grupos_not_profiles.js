/**
 * Grupos não são perfis (Administrador/Visualizador).
 * Renomeia os grupos iniciais e remove grupo_id dos usuários administradores.
 */
exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('indicadores_grupos');
  if (hasTable) {
    await knex('indicadores_grupos').where({ id: 1 }).update({
      nome: 'Geral',
      descricao: 'Grupo para vincular visualizadores às pastas de indicadores'
    }).catch(() => {});
    await knex('indicadores_grupos').where({ id: 2 }).update({
      nome: 'Comercial',
      descricao: 'Grupo para acesso às pastas comerciais'
    }).catch(() => {});
  }

  const hasGrupoId = await knex.schema.hasColumn('usuarios', 'grupo_id');
  if (hasGrupoId) {
    await knex.raw(`
      UPDATE usuarios SET grupo_id = NULL WHERE cd_perfil_inicial = 3 OR LOWER(nm_usuario) = 'pedrosantos'
    `).catch(() => {});
  }
};

exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable('indicadores_grupos');
  if (hasTable) {
    await knex('indicadores_grupos').where({ id: 1 }).update({ nome: 'Administrador', descricao: 'Acesso total a todas as pastas' }).catch(() => {});
    await knex('indicadores_grupos').where({ id: 2 }).update({ nome: 'Visualizadores', descricao: 'Grupo padrão para visualização' }).catch(() => {});
  }
  const hasGrupoId = await knex.schema.hasColumn('usuarios', 'grupo_id');
  if (hasGrupoId) {
    await knex.raw(`
      UPDATE usuarios SET grupo_id = 1 WHERE cd_perfil_inicial = 3 OR LOWER(nm_usuario) = 'pedrosantos'
    `).catch(() => {});
    await knex.raw(`UPDATE usuarios SET grupo_id = 2 WHERE grupo_id IS NULL`).catch(() => {});
  }
};
