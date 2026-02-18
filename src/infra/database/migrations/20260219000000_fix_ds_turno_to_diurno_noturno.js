exports.up = async function(knex) {
    const escalas = ['12x36', '6x1', '5x2', '24x48'];
    await knex('staff_funcionarios')
        .whereIn('ds_turno', escalas)
        .update({ ds_turno: 'Diurno' });
};

exports.down = async function(knex) {
    // Não revertível - mantém Diurno
};
