/**
 * Tabela de grupos para permissões (nome do grupo em vez de só número).
 * Usuários (usuarios.grupo_id) e permissões (indicadores_permissoes.grupo_id) referenciam este id.
 */
exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('indicadores_grupos');
  if (!hasTable) {
    await knex.schema.createTable('indicadores_grupos', (table) => {
      table.increments('id').primary();
      table.string('nome').notNullable();
      table.string('descricao').nullable();
      table.integer('ordem').defaultTo(0);
      table.timestamps(true, true);
    });
    await knex('indicadores_grupos').insert([
      { id: 1, nome: 'Administrador', descricao: 'Acesso total a todas as pastas', ordem: 0 },
      { id: 2, nome: 'Visualizadores', descricao: 'Grupo padrão para visualização', ordem: 1 }
    ]);
    await knex.raw("SELECT setval(pg_get_serial_sequence('indicadores_grupos', 'id'), 2)").catch(() => {});
  }

  const hasGrupoId = await knex.schema.hasColumn('usuarios', 'grupo_id');
  if (!hasGrupoId) {
    await knex.schema.table('usuarios', (table) => {
      table.integer('grupo_id').unsigned().defaultTo(2);
    });
    await knex.raw(`
      UPDATE usuarios SET grupo_id = 1 WHERE cd_perfil_inicial = 3 OR LOWER(nm_usuario) = 'pedrosantos'
    `).catch(() => {});
    await knex.raw(`UPDATE usuarios SET grupo_id = 2 WHERE grupo_id IS NULL`).catch(() => {});
  }
};

exports.down = async function(knex) {
  if (await knex.schema.hasColumn('usuarios', 'grupo_id')) {
    await knex.schema.table('usuarios', (table) => table.dropColumn('grupo_id'));
  }
  if (await knex.schema.hasTable('indicadores_grupos')) {
    await knex.schema.dropTable('indicadores_grupos');
  }
};
