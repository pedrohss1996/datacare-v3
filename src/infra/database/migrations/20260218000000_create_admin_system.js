/**
 * Sistema de Administração: Grupos, Módulos e Permissões por Grupo
 * - admin_grupos: grupos de usuários (Administrador, Visualizadores, etc)
 * - admin_modulos: módulos do sistema (Analytics, Connect, Quality, Staff)
 * - admin_grupo_modulos: libera módulos por grupo
 */
exports.up = async function(knex) {
  // 1. Tabela admin_grupos
  if (!(await knex.schema.hasTable('admin_grupos'))) {
    await knex.schema.createTable('admin_grupos', (table) => {
      table.increments('id').primary();
      table.string('nome', 100).notNullable();
      table.string('descricao', 255).nullable();
      table.integer('ordem').defaultTo(0);
      table.boolean('ativo').defaultTo(true);
      table.timestamps(true, true);
    });
    await knex('admin_grupos').insert([
      { id: 1, nome: 'Administrador', descricao: 'Acesso total a todos os módulos', ordem: 0 },
      { id: 2, nome: 'Usuário Padrão', descricao: 'Acesso conforme liberação por módulo', ordem: 1 },
    ]);
    await knex.raw("SELECT setval(pg_get_serial_sequence('admin_grupos', 'id'), 2)").catch(() => {});
  }

  // 2. Tabela admin_modulos
  if (!(await knex.schema.hasTable('admin_modulos'))) {
    await knex.schema.createTable('admin_modulos', (table) => {
      table.increments('id').primary();
      table.string('slug', 50).notNullable().unique();
      table.string('nome', 100).notNullable();
      table.string('descricao', 255).nullable();
      table.string('icone', 50).defaultTo('fa-solid fa-cube');
      table.string('rota', 100).nullable();
      table.integer('ordem').defaultTo(0);
      table.boolean('ativo').defaultTo(true);
      table.timestamps(true, true);
    });
    await knex('admin_modulos').insert([
      { slug: 'analytics', nome: 'Analytics (BI)', descricao: 'Dashboards e Business Intelligence', icone: 'fa-solid fa-chart-line', rota: '/analytics', ordem: 1 },
      { slug: 'connect', nome: 'Connect', descricao: 'Chat e comunicação', icone: 'fa-solid fa-comments', rota: '/chat', ordem: 2 },
      { slug: 'quality', nome: 'Quality', descricao: 'Qualidade e indicadores', icone: 'fa-solid fa-award', rota: '/quality', ordem: 3 },
      { slug: 'staff', nome: 'Staff', descricao: 'Escalas e equipes', icone: 'fa-solid fa-users-cog', rota: '/staff', ordem: 4 },
    ]);
  }

  // 3. Tabela admin_grupo_modulos (grupo X módulo)
  if (!(await knex.schema.hasTable('admin_grupo_modulos'))) {
    await knex.schema.createTable('admin_grupo_modulos', (table) => {
      table.increments('id').primary();
      table.integer('grupo_id').unsigned().notNullable().references('id').inTable('admin_grupos').onDelete('CASCADE');
      table.integer('modulo_id').unsigned().notNullable().references('id').inTable('admin_modulos').onDelete('CASCADE');
      table.unique(['grupo_id', 'modulo_id']);
    });
    // Administrador (grupo 1) tem acesso a todos os módulos
    const modulos = await knex('admin_modulos').select('id');
    for (const m of modulos) {
      await knex('admin_grupo_modulos').insert({ grupo_id: 1, modulo_id: m.id });
    }
  }

  // 4. Adiciona grupo_id em usuarios se não existir
  const hasGrupoId = await knex.schema.hasColumn('usuarios', 'grupo_id');
  if (!hasGrupoId) {
    await knex.schema.table('usuarios', (table) => {
      table.integer('grupo_id').unsigned().defaultTo(2);
    });
    await knex.raw(`
      UPDATE usuarios SET grupo_id = 1 WHERE cd_perfil_inicial = 3
    `).catch(() => {});
    await knex.raw(`UPDATE usuarios SET grupo_id = 2 WHERE grupo_id IS NULL`).catch(() => {});
  }
};

exports.down = async function(knex) {
  if (await knex.schema.hasColumn('usuarios', 'grupo_id')) {
    await knex.schema.table('usuarios', (t) => t.dropColumn('grupo_id'));
  }
  if (await knex.schema.hasTable('admin_grupo_modulos')) {
    await knex.schema.dropTable('admin_grupo_modulos');
  }
  if (await knex.schema.hasTable('admin_modulos')) {
    await knex.schema.dropTable('admin_modulos');
  }
  if (await knex.schema.hasTable('admin_grupos')) {
    await knex.schema.dropTable('admin_grupos');
  }
};
