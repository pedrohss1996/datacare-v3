/**
 * Migration: Gerenciador de Metadados de Queries
 * Dicionário de dados para catalogar funções do hospital.
 * Usado pela Engine de Geração de Páginas Inteligentes (IA).
 * 
 * REGRA DE OURO: O frontend NUNCA envia SQL puro - apenas o query_cod (hash).
 */
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('query_metadados');
  if (exists) return;

  return knex.schema.createTable('query_metadados', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Identificador único usado pelo frontend (hash MD5/SHA - nunca o SQL)
    table.string('query_cod', 64).notNullable().unique();
    table.string('nome', 255).notNullable();
    table.text('descricao');
    table.string('modulo_funcional', 100); // Ex: Faturamento, Internação, Auditoria

    // Fonte de dados: oracle (Tasy) ou postgres
    table.string('fonte_dados', 20).defaultTo('oracle');
    table.text('query_sql').notNullable(); // SQL real - somente no backend

    // Metadados para a IA (JSON)
    // colunas: [ { nome, tipo, descricao, alias } ]
    table.jsonb('colunas').defaultTo('[]');
    // variaveis: [ { nome, tipo, default, obrigatorio } ] - placeholders :data_inicio, :data_fim
    table.jsonb('variaveis').defaultTo('[]');

    // Tags para descoberta pela IA (ex: "liberacao", "faturamento", "auditoria")
    table.jsonb('tags').defaultTo('[]');

    // Multi-tenancy (preparado para futuro)
    table.integer('hospital_id').unsigned().nullable();

    table.boolean('ativo').defaultTo(true);
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('query_metadados');
};
