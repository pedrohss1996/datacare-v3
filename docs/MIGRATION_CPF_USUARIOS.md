# Migration: Adicionar CPF na tabela usuarios

## ⚠️ Importante

O módulo de usuários está funcional **sem** a coluna `nr_cpf` na tabela `usuarios`. O CPF será buscado da tabela `pessoa_fisica` através do relacionamento.

Porém, para melhor performance e para o módulo de Consultórios funcionar plenamente, é recomendado adicionar a coluna.

## 🔧 Executar a Migration

### Opção 1: Via Knex (Recomendado)

```bash
npx knex migrate:latest --knexfile src/infra/database/knexfile.js
```

### Opção 2: SQL Manual

Se preferir executar direto no banco:

```sql
-- Adiciona coluna nr_cpf na tabela usuarios
ALTER TABLE usuarios ADD COLUMN nr_cpf VARCHAR(11);

-- Cria índice para otimizar buscas
CREATE INDEX idx_usuarios_nr_cpf ON usuarios(nr_cpf);

-- Popula o campo com os CPFs da pessoa_fisica vinculada
UPDATE usuarios u
SET nr_cpf = pf.nr_cpf
FROM pessoa_fisica pf
WHERE u.cd_pessoa = pf.cd_pessoa_fisica
AND pf.nr_cpf IS NOT NULL;
```

## ✅ Verificar se funcionou

```sql
-- Verifica se a coluna foi criada
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'usuarios' 
AND column_name = 'nr_cpf';

-- Verifica quantos usuários têm CPF
SELECT 
    COUNT(*) as total_usuarios,
    COUNT(nr_cpf) as usuarios_com_cpf,
    COUNT(*) - COUNT(nr_cpf) as usuarios_sem_cpf
FROM usuarios;
```

## 📋 Após a migration

1. Reinicie o servidor (se necessário)
2. O sistema passará a salvar o CPF diretamente na tabela `usuarios`
3. Melhor performance nas consultas
4. Módulo de Consultórios funcionará plenamente

## 🔄 Como funciona agora (antes da migration)

- O sistema busca o CPF da tabela `pessoa_fisica` via JOIN
- Funciona perfeitamente, mas com uma query a mais
- No cadastro/edição, o CPF é salvo apenas em `pessoa_fisica`

## 🚀 Como funcionará (após a migration)

- CPF duplicado em `usuarios` e `pessoa_fisica` para performance
- Uma query a menos nas buscas
- Módulo de Consultórios busca direto de `usuarios`
- Sistema detecta automaticamente a existência da coluna

## 💡 Nota

O código foi preparado para funcionar **com ou sem** a coluna `nr_cpf` em `usuarios`. Ele verifica automaticamente a existência da coluna e se adapta.
