-- Script para corrigir a sequence da tabela pessoa_fisica
-- Execute este script no PostgreSQL

-- 1. Verifica o máximo ID atual na tabela
SELECT MAX(cd_pessoa_fisica) FROM pessoa_fisica;

-- 2. Verifica o valor atual da sequence
SELECT currval(pg_get_serial_sequence('pessoa_fisica', 'cd_pessoa_fisica'));

-- 3. Corrige a sequence para o próximo valor correto
SELECT setval(
    pg_get_serial_sequence('pessoa_fisica', 'cd_pessoa_fisica'),
    (SELECT COALESCE(MAX(cd_pessoa_fisica), 0) + 1 FROM pessoa_fisica),
    false
);

-- 4. Verifica se foi corrigido
SELECT currval(pg_get_serial_sequence('pessoa_fisica', 'cd_pessoa_fisica'));
