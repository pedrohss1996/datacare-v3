# ⚡ Guia Rápido: Configurar Médico no Consultórios

## 🎯 Objetivo

Vincular um usuário do DataCare a um médico do TASY para que ele veja sua agenda de consultas.

## 📝 Passo a Passo

### 1. Descobrir o CD_MEDICO no TASY (Oracle)

Você precisa saber qual é o **CD_MEDICO** do médico no sistema TASY.

#### Opção A: Consultar pela agenda atual

```sql
-- Execute no Oracle (TASY)
SELECT DISTINCT 
    a.cd_medico,
    obter_nome_pessoa(a.cd_pessoa_fisica) AS NOME_MEDICO,
    COUNT(*) AS AGENDAS_HOJE
FROM agenda a
WHERE a.ie_situacao = 'A' 
  AND a.cd_tipo_agenda = 3
  AND TRUNC(a.dt_agenda) = TRUNC(SYSDATE)
GROUP BY a.cd_medico, obter_nome_pessoa(a.cd_pessoa_fisica)
ORDER BY NOME_MEDICO;
```

**Resultado esperado:**

| CD_MEDICO | NOME_MEDICO | AGENDAS_HOJE |
|-----------|-------------|--------------|
| 12345 | DR. JOÃO SILVA | 8 |
| 67890 | DRA. MARIA SANTOS | 12 |

#### Opção B: Se souber o CPF do médico

```sql
-- Execute no Oracle (TASY)
SELECT 
    pf.cd_pessoa_fisica,
    pf.nm_pessoa_fisica,
    pf.nr_cpf,
    m.cd_medico
FROM pessoa_fisica pf
LEFT JOIN medico m ON pf.cd_pessoa_fisica = m.cd_pessoa_fisica
WHERE pf.nr_cpf = '87209829172';  -- Substitua pelo CPF do médico
```

---

### 2. Criar ou Editar Usuário no DataCare

#### Via Interface Web (Recomendado) 🖱️

1. **Acesse:** http://localhost:3000/pessoas
2. **Ação:**
   - Se o usuário **não existe**: Clique em **"Novo Usuário"**
   - Se já existe: Clique em **"Editar"** ao lado do usuário
3. **Preencha:**

```
┌─────────────────────────────────────────┐
│ DADOS DE ACESSO                         │
├─────────────────────────────────────────┤
│ Usuário (Login):    marlonmedico        │
│ Senha:              ********** (forte!) │
│ Perfil:             Médico              │
│ Situação:           Ativo               │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ DADOS PESSOAIS                          │
├─────────────────────────────────────────┤
│ Nome Completo:      Dr. Marlon Médico   │
│ CPF:                872.098.291-72      │
│ Código Médico:      12345  ← IMPORTANTE!│
└─────────────────────────────────────────┘
```

4. **Salve** ✅

#### Via Script Node.js 💻

```bash
# Atualizar usuário existente
node scripts/update-user-cd-medico.js marlonmedico 12345
```

Onde:
- `marlonmedico` = Login do usuário
- `12345` = CD_MEDICO encontrado no TASY

---

### 3. Testar o Acesso ✅

1. **Faça login:** http://localhost:3000/login
   - Usuário: `marlonmedico`
   - Senha: A que você cadastrou

2. **Acesse:** http://localhost:3000/consultorios/agenda

3. **Resultado esperado:**
   - ✅ Lista de consultas aparece
   - ✅ Você pode filtrar por data e status
   - ✅ Você pode buscar por nome de paciente

---

## 🚨 Troubleshooting

### ❌ Erro: "Código de médico (TASY) não cadastrado"

**Problema:** O usuário não tem `cd_medico_tasy` vinculado.

**Solução:**
1. Acesse `/pessoas`
2. Edite o usuário
3. Preencha o campo **"Código Médico (TASY)"**
4. Salve

---

### ❌ Agenda vazia (nenhuma consulta aparece)

**Possíveis causas:**

1. **CD_MEDICO errado**
   - Verifique no TASY se o código está correto
   - Execute a query do passo 1 novamente

2. **Sem agendas hoje**
   - Tente mudar a data no filtro da tela
   - Veja agendas passadas ou futuras

3. **Agendas inativas**
   - Verifique `IE_SITUACAO` no TASY
   - Deve ser `'A'` (Ativo)

**Debug:**

Veja os logs no terminal do servidor:

```bash
# Terminal onde o servidor está rodando
# Procure por:
✅ Buscando consultas para CD_MEDICO: 12345
Filtros: { data: '2026-01-27', status: 'todos' }
```

Se `CD_MEDICO` aparecer como `undefined` ou `null`, o vínculo não foi salvo.

---

### ❌ Erro ao fazer login: "Usuário ou senha inválidos"

**Possíveis causas:**

1. **Senha incorreta** - Digite a senha corretamente
2. **Usuário não existe** - Cadastre primeiro em `/pessoas/novo`
3. **Usuário inativo** - Verifique a situação do usuário

---

## 📊 Verificação Rápida

### Ver usuários vinculados

```sql
-- Execute no PostgreSQL (DataCare)
SELECT 
    cd_usuario,
    nm_usuario AS login,
    ds_usuario AS nome,
    cd_medico_tasy,
    CASE 
        WHEN cd_medico_tasy IS NOT NULL THEN '✅ Pronto'
        ELSE '❌ Falta configurar'
    END as status
FROM usuarios
WHERE cd_perfil_inicial = 2  -- Perfil "Médico"
ORDER BY nm_usuario;
```

### Testar agendas de um CD_MEDICO

```sql
-- Execute no Oracle (TASY)
SELECT COUNT(*) AS total_agendas
FROM agenda
WHERE cd_medico = 12345  -- Substitua pelo CD_MEDICO
  AND IE_SITUACAO = 'A'
  AND CD_TIPO_AGENDA = 3
  AND TRUNC(dt_agenda) = TRUNC(SYSDATE);
```

Se retornar `0`, o médico não tem agendas hoje.

---

## 📚 Links Úteis

- **Documentação completa:** [DEPARA_CD_MEDICO.md](./DEPARA_CD_MEDICO.md)
- **Arquitetura:** [ARQUITETURA_CONSULTORIOS.md](./ARQUITETURA_CONSULTORIOS.md)
- **Autenticação:** [AUTENTICACAO_HIBRIDA.md](./AUTENTICACAO_HIBRIDA.md)

---

## 🎉 Exemplo Completo

```bash
# 1. Descobrir CD_MEDICO (consulte no TASY)
# Resultado: 12345

# 2. Criar usuário via interface web
# http://localhost:3000/pessoas/novo
# - Login: marlonmedico
# - Senha: MinhaS3nh@Forte
# - Nome: Dr. Marlon Médico
# - CPF: 872.098.291-72
# - Código Médico (TASY): 12345

# 3. Fazer login
# http://localhost:3000/login
# Usuário: marlonmedico
# Senha: MinhaS3nh@Forte

# 4. Acessar agenda
# http://localhost:3000/consultorios/agenda
# ✅ Ver lista de consultas!
```

---

**Tempo estimado:** 5-10 minutos  
**Última atualização:** 30/01/2026
