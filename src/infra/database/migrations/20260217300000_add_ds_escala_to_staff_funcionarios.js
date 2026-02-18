exports.up = async function(knex) {
    const hasColumn = await knex.schema.hasColumn('staff_funcionarios', 'ds_escala');
    if (!hasColumn) {
        await knex.schema.table('staff_funcionarios', (table) => {
            table.string('ds_escala', 20).defaultTo('12x36');
        });
    }
};

exports.down = async function(knex) {
    if (await knex.schema.hasColumn('staff_funcionarios', 'ds_escala')) {
        await knex.schema.table('staff_funcionarios', (table) => table.dropColumn('ds_escala'));
    }
};
