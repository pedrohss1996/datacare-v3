# Erro: duplicate key value violates unique constraint

## 🐛 Problema

```
duplicate key value violates unique constraint "pessoa_fisica_pkey"
Key (cd_pessoa_fisica)=(2) already exists.
```

### O que aconteceu?

O PostgreSQL usa **sequences** (sequências) para gerar IDs automáticos. Quando você:
- Importa dados de outro banco
- Faz INSERT manual com ID específico
- Restaura um backup

A sequence pode ficar **dessincronizada** com os dados reais da tabela.

**Exemplo:**
```
Tabela pessoa_fisica tem registros: 1, 2, 3, 4, 5
Mas a sequence está em: 1

Quando tentar inserir novo registro:
- Sistema busca próximo ID da sequence: 2
- Tenta INSERT com ID 2
- ❌ ERRO! ID 2 já existe
```

## ✅ Solução

### Opção 1: Script JavaScript (Recomendado)

Execute o script que corrige automaticamente:

```bash
node scripts/fix-sequences.js
```

**Saída esperada:**
```
🔧 Corrigindo sequences do banco de dados...

📋 Tabela: pessoa_fisica
   Max ID atual: 5
   Sequence: public.pessoa_fisica_cd_pessoa_fisica_seq
   ✅ Sequence ajustada para: 6
   Próximo ID será: 6

📋 Tabela: usuarios
   Max ID atual: 3
   Sequence: public.usuarios_cd_usuario_seq
   ✅ Sequence ajustada para: 4
   Próximo ID será: 4

✅ Todas as sequences foram corrigidas!
```

### Opção 2: SQL Manual

Execute direto no PostgreSQL:

```sql
-- Para pessoa_fisica
SELECT setval(
    pg_get_serial_sequence('pessoa_fisica', 'cd_pessoa_fisica'),
    (SELECT COALESCE(MAX(cd_pessoa_fisica), 0) + 1 FROM pessoa_fisica),
    false
);

-- Para usuarios
SELECT setval(
    pg_get_serial_sequence('usuarios', 'cd_usuario'),
    (SELECT COALESCE(MAX(cd_usuario), 0) + 1 FROM usuarios),
    false
);
```

### Opção 3: Comando rápido

```sql
-- Corrige pessoa_fisica
SELECT setval('pessoa_fisica_cd_pessoa_fisica_seq', 
    (SELECT MAX(cd_pessoa_fisica) FROM pessoa_fisica) + 1);

-- Corrige usuarios
SELECT setval('usuarios_cd_usuario_seq', 
    (SELECT MAX(cd_usuario) FROM usuarios) + 1);
```

## 🔍 Verificar se funcionou

### Verificar máximo ID:
```sql
SELECT MAX(cd_pessoa_fisica) FROM pessoa_fisica;
-- Resultado: 5 (por exemplo)
```

### Verificar sequence atual:
```sql
SELECT currval(pg_get_serial_sequence('pessoa_fisica', 'cd_pessoa_fisica'));
-- Deve ser: 6 (MAX + 1)
```

### Testar INSERT:
```sql
INSERT INTO pessoa_fisica (nm_pessoa_fisica) VALUES ('TESTE');
-- Deve funcionar sem erro!
```

## 🛡️ Prevenir no futuro

### ❌ Evite fazer:

```sql
-- NÃO faça INSERT com ID manual
INSERT INTO pessoa_fisica (cd_pessoa_fisica, nm_pessoa_fisica) 
VALUES (100, 'FULANO'); -- ❌ Vai dessinc a sequence!
```

### ✅ Sempre faça:

```sql
-- Deixe o PostgreSQL gerenciar o ID
INSERT INTO pessoa_fisica (nm_pessoa_fisica) 
VALUES ('FULANO'); -- ✅ ID gerado automaticamente
```

## 🔧 Outras tabelas com sequence

Se o erro acontecer em outras tabelas, siga o mesmo padrão:

```sql
-- Template genérico
SELECT setval(
    pg_get_serial_sequence('nome_tabela', 'nome_coluna_id'),
    (SELECT COALESCE(MAX(nome_coluna_id), 0) + 1 FROM nome_tabela),
    false
);
```

**Exemplos:**
```sql
-- Para tabela indicadores
SELECT setval('config_indicadores_cd_indicador_seq', 
    (SELECT MAX(cd_indicador) FROM config_indicadores) + 1);

-- Para tabela audit_logs
SELECT setval('audit_logs_id_seq', 
    (SELECT MAX(id) FROM audit_logs) + 1);
```

## 📊 Entendendo o problema

```
┌─────────────────────────────────────────┐
│         TABELA: pessoa_fisica           │
├─────────────────────────────────────────┤
│ cd_pessoa_fisica │ nm_pessoa_fisica     │
│ 1                │ JOÃO SILVA           │
│ 2                │ MARIA SANTOS         │
│ 3                │ PEDRO COSTA          │
│ 4                │ ANA PAULA            │
│ 5                │ CARLOS SOUZA         │
└─────────────────────────────────────────┘
        ▲
        │ MAX ID = 5
        │
┌───────┴─────────────────────────────────┐
│   SEQUENCE (antes da correção)          │
│   pessoa_fisica_cd_pessoa_fisica_seq    │
│   last_value = 1  ❌ ERRADO!            │
└─────────────────────────────────────────┘
        │
        │ Tenta inserir com ID 2
        ▼
┌─────────────────────────────────────────┐
│   ❌ ERRO: ID 2 já existe!              │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│   SEQUENCE (depois da correção)         │
│   pessoa_fisica_cd_pessoa_fisica_seq    │
│   last_value = 6  ✅ CORRETO!           │
└─────────────────────────────────────────┘
        │
        │ Próximo INSERT = ID 6
        ▼
┌─────────────────────────────────────────┐
│   ✅ Sucesso! Novo registro criado      │
└─────────────────────────────────────────┘
```

## 🚀 Resumo rápido

1. Execute: `node scripts/fix-sequences.js`
2. Tente cadastrar novo usuário
3. Deve funcionar! ✅

Se o erro persistir, entre em contato com o administrador do banco.
