/**
 * Migration: Adiciona campo cd_medico_tasy à tabela usuarios
 * 
 * Este campo armazena o código do médico no TASY (Oracle) para integração
 * com a agenda de consultas do módulo Consultórios.
 * 
 * DEPARA: usuarios.cd_medico_tasy → agenda.CD_MEDICO (Oracle)
 */

exports.up = function(knex) {
    return knex.schema.table('usuarios', function(table) {
        table.integer('cd_medico_tasy').nullable().comment('Código do médico no TASY (Oracle) - DEPARA para agenda');
        table.index('cd_medico_tasy', 'idx_usuarios_cd_medico_tasy');
    });
};

exports.down = function(knex) {
    return knex.schema.table('usuarios', function(table) {
        table.dropIndex('cd_medico_tasy', 'idx_usuarios_cd_medico_tasy');
        table.dropColumn('cd_medico_tasy');
    });
};
