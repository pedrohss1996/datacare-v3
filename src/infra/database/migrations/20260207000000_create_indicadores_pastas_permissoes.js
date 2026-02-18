/**
 * Cria tabelas indicadores_pastas e indicadores_permissoes.
 * Adiciona pasta_id e responsavel em config_indicadores se não existirem.
 */
exports.up = async function(knex) {
  const existsPastas = await knex.schema.hasTable('indicadores_pastas');
  if (!existsPastas) {
    await knex.schema.createTable('indicadores_pastas', (table) => {
      table.increments('id').primary();
      table.string('nome').notNullable();
      table.string('descricao').nullable();
      table.string('icone').defaultTo('fa-solid fa-folder');
      table.string('cor_hex').defaultTo('#6366f1');
      table.boolean('ativo').defaultTo(true);
      table.integer('ordem').defaultTo(0);
      table.timestamps(true, true);
    });
  }

  const existsPermissoes = await knex.schema.hasTable('indicadores_permissoes');
  if (!existsPermissoes) {
    await knex.schema.createTable('indicadores_permissoes', (table) => {
      table.increments('id').primary();
      table.integer('pasta_id').unsigned().notNullable().references('id').inTable('indicadores_pastas').onDelete('CASCADE');
      table.integer('grupo_id').notNullable();
      table.unique(['pasta_id', 'grupo_id']);
    });
  }

  const hasPastaId = await knex.schema.hasColumn('config_indicadores', 'pasta_id');
  if (!hasPastaId) {
    await knex.schema.table('config_indicadores', (table) => {
      table.integer('pasta_id').unsigned().nullable().references('id').inTable('indicadores_pastas').onDelete('SET NULL');
    });
  }
  const hasResponsavel = await knex.schema.hasColumn('config_indicadores', 'responsavel');
  if (!hasResponsavel) {
    await knex.schema.table('config_indicadores', (table) => {
      table.string('responsavel').nullable();
    });
  }
};

exports.down = async function(knex) {
  if (await knex.schema.hasTable('indicadores_permissoes')) {
    await knex.schema.dropTableIfExists('indicadores_permissoes');
  }
  if (await knex.schema.hasColumn('config_indicadores', 'pasta_id')) {
    await knex.schema.table('config_indicadores', (t) => t.dropColumn('pasta_id'));
  }
  if (await knex.schema.hasColumn('config_indicadores', 'responsavel')) {
    await knex.schema.table('config_indicadores', (t) => t.dropColumn('responsavel'));
  }
  if (await knex.schema.hasTable('indicadores_pastas')) {
    await knex.schema.dropTableIfExists('indicadores_pastas');
  }
};
