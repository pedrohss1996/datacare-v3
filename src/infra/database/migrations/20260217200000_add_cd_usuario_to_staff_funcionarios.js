exports.up = async function(knex) {
    const hasColumn = await knex.schema.hasColumn('staff_funcionarios', 'cd_usuario');
    if (!hasColumn) {
        await knex.schema.table('staff_funcionarios', (table) => {
            table.integer('cd_usuario').unsigned().nullable().references('cd_usuario').inTable('usuarios').onDelete('SET NULL');
        });
    }
};

exports.down = async function(knex) {
    if (await knex.schema.hasColumn('staff_funcionarios', 'cd_usuario')) {
        await knex.schema.table('staff_funcionarios', (table) => table.dropColumn('cd_usuario'));
    }
};
