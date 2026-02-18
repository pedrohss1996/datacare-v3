/**
 * Tabela de favoritos por usuário (configuração individual).
 * cd_usuario = usuário; config_indicador_id = id do config_indicadores.
 */
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('indicadores_favoritos');
  if (!exists) {
    await knex.schema.createTable('indicadores_favoritos', (table) => {
      table.increments('id').primary();
      table.integer('cd_usuario').unsigned().notNullable();
      table.integer('config_indicador_id').unsigned().notNullable().references('id').inTable('config_indicadores').onDelete('CASCADE');
      table.unique(['cd_usuario', 'config_indicador_id']);
    });
  }
};

exports.down = async function(knex) {
  if (await knex.schema.hasTable('indicadores_favoritos')) {
    await knex.schema.dropTableIfExists('indicadores_favoritos');
  }
};
