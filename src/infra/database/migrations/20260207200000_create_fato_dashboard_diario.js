/**
 * Star Schema / Tabela de Agregados para Dashboard de Indicadores.
 * Garante consultas em sub-segundos via Index Scan na tabela de resumo.
 * Grain: Dia + Unidade + Especialidade (opcional: Convênio).
 */
exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('fato_dashboard_diario');
  if (exists) return;

  await knex.schema.createTable('fato_dashboard_diario', (table) => {
    table.increments('id').primary();
    table.date('data_ref').notNullable().index();
    table.string('unidade_nome', 200).nullable().index();
    table.string('especialidade_nome', 200).nullable().index();
    table.string('convenio_nome', 200).nullable();
    table.integer('qtd_atendimentos').defaultTo(0);
    table.decimal('valor_faturamento', 14, 2).defaultTo(0);
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_fato_dashboard_data_ref_unidade
    ON fato_dashboard_diario (data_ref, unidade_nome)
  `).catch(() => {});
  await knex.raw(`
    CREATE INDEX idx_fato_dashboard_data_ref_especialidade
    ON fato_dashboard_diario (data_ref, especialidade_nome)
  `).catch(() => {});

  const hasAggregateKey = await knex.schema.hasColumn('config_indicadores', 'aggregate_key');
  if (!hasAggregateKey) {
    await knex.schema.table('config_indicadores', (t) => {
      t.string('aggregate_key', 64).nullable();
    });
  }
};

exports.down = async function (knex) {
  if (await knex.schema.hasColumn('config_indicadores', 'aggregate_key')) {
    await knex.schema.table('config_indicadores', (t) => t.dropColumn('aggregate_key'));
  }
  await knex.raw('DROP INDEX IF EXISTS idx_fato_dashboard_data_ref_especialidade');
  await knex.raw('DROP INDEX IF EXISTS idx_fato_dashboard_data_ref_unidade');
  await knex.schema.dropTableIfExists('fato_dashboard_diario');
};
