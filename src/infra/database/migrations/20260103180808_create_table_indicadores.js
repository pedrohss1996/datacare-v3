/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('config_indicadores', (table) => {
      table.increments('id').primary();
      
      // Configuração Visual
      table.string('titulo').notNullable(); // Ex: "Faturamento Mensal"
      table.string('descricao'); // Ex: "Soma do valor líquido..."
      table.string('tipo_grafico').notNullable(); // 'numero', 'pizza', 'barra', 'linha', 'tabela'
      table.string('cor_base').defaultTo('#3B82F6'); // Cor principal do gráfico
      table.integer('largura').defaultTo(1); // 1 = 1/3 da tela, 2 = 2/3, 3 = Tela cheia
      
      // Configuração de Dados (O Segredo)
      table.string('fonte_dados').defaultTo('app'); // 'app' (Postgres) ou 'oracle' (Tasy)
      table.text('query_sql').notNullable(); // A query bruta. Ex: "SELECT count(*) as valor FROM..."
      
      // Controle
      table.boolean('ativo').defaultTo(true);
      table.integer('ordem').defaultTo(99); // Para ordenar na tela
      table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('config_indicadores');
};