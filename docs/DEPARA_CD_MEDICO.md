# DEPARA: Código de Médico (TASY)

## 🔗 Integração DataCare ↔ TASY

### O que é o DEPARA?

DEPARA (De-Para) é o **vínculo entre um usuário do DataCare e um médico no TASY**. Esse vínculo é necessário para que o módulo **Consultórios** possa exibir a agenda correta de cada médico.

## 📊 Como funciona

### Estrutura

```
┌─────────────────────────────────────────────┐
│         PostgreSQL (DataCare)               │
│                                             │
│  usuarios                                   │
│  ├─ cd_usuario (PK)                        │
│  ├─ nm_usuario (login)                     │
│  ├─ nr_cpf                                 │
│  └─ cd_medico_tasy ← CHAVE DE INTEGRAÇÃO  │
└─────────────┬───────────────────────────────┘
              │ DEPARA
              │ cd_medico_tasy = CD_MEDICO
              ▼
┌─────────────────────────────────────────────┐
│          Oracle (TASY)                      │
│                                             │
│  agenda                                     │
│  ├─ cd_agenda (PK)                         │
│  ├─ cd_medico ← MÉDICO QUE ATENDE          │
│  ├─ dt_agenda                              │
│  ├─ hr_agenda                              │
│  └─ ie_situacao                            │
└─────────────────────────────────────────────┘
```

### Query de Integração

Quando um médico acessa `/consultorios/agenda`, o sistema:

1. **Busca no PostgreSQL** o `cd_medico_tasy` do usuário logado
2. **Busca no Oracle (TASY)** todas as agendas com `cd_medico = cd_medico_tasy`

```sql
-- Exemplo: usuário marlonmedico tem cd_medico_tasy = 12345

-- PostgreSQL
SELECT cd_medico_tasy 
FROM usuarios 
WHERE cd_usuario = 123;  -- Retorna: 12345

-- Oracle (TASY)
SELECT * 
FROM DC_CHAT_AGENDAS
WHERE CD_AGENDA IN (
    SELECT cd_agenda 
    FROM agenda 
    WHERE cd_medico = 12345  -- cd_medico_tasy do usuário
    AND IE_SITUACAO = 'A' 
    AND CD_TIPO_AGENDA = 3
)
ORDER BY HR_AGENDA;
```

## 🔧 Como Configurar

### 1. Rodar a Migration

```bash
npx knex migrate:latest
```

Isso adiciona a coluna `cd_medico_tasy` na tabela `usuarios`.

### 2. Descobrir o CD_MEDICO no TASY

Você precisa descobrir qual é o `CD_MEDICO` do médico no TASY. Há várias formas:

#### Opção A: Consultar a view DC_CHAT_AGENDAS

```sql
-- No Oracle (TASY)
SELECT DISTINCT 
    a.cd_medico,
    obter_nome_pessoa(a.cd_pessoa_fisica) AS NOME_MEDICO
FROM agenda a
WHERE a.ie_situacao = 'A' 
  AND a.cd_tipo_agenda = 3
  AND TRUNC(a.dt_agenda) = TRUNC(SYSDATE)
ORDER BY NOME_MEDICO;
```

#### Opção B: Consultar pela pessoa_fisica

```sql
-- Se você sabe o CPF do médico
SELECT 
    pf.cd_pessoa_fisica,
    pf.nm_pessoa_fisica,
    pf.nr_cpf,
    m.cd_medico
FROM pessoa_fisica pf
LEFT JOIN medico m ON pf.cd_pessoa_fisica = m.cd_pessoa_fisica
WHERE pf.nr_cpf = '87209829172';
```

#### Opção C: Consultar uma agenda específica

```sql
-- Encontre uma agenda do médico e veja o CD_MEDICO
SELECT 
    cd_agenda,
    cd_medico,
    nm_paciente,
    dt_agenda,
    hr_agenda
FROM DC_CHAT_AGENDAS
WHERE TRUNC(dt_agenda) = TRUNC(SYSDATE)
  AND nm_paciente LIKE '%NOME_PACIENTE%'
ORDER BY hr_agenda;
```

### 3. Atualizar o Usuário no DataCare

Há **3 formas** de vincular o `cd_medico_tasy`:

#### A. Via Interface Web (Recomendado)

1. Acesse: `http://localhost:3000/pessoas`
2. Clique em **Editar** no usuário (ex: marlonmedico)
3. Preencha o campo **"Código Médico (TASY)"** com o valor encontrado
4. Salve

#### B. Via Script Node.js

```bash
node scripts/update-user-cd-medico.js marlonmedico 12345
```

Onde:
- `marlonmedico` = Login do usuário no DataCare
- `12345` = CD_MEDICO do TASY

#### C. Via SQL Direto (PostgreSQL)

```sql
UPDATE usuarios 
SET cd_medico_tasy = 12345,
    dt_atualizacao = NOW()
WHERE nm_usuario = 'marlonmedico';
```

### 4. Testar

1. Faça login com o usuário: `marlonmedico`
2. Acesse: `/consultorios/agenda`
3. Deve aparecer a agenda do médico! 🎉

## ✅ Verificação

### Ver todos os médicos vinculados

```sql
-- PostgreSQL
SELECT 
    cd_usuario,
    nm_usuario AS login,
    ds_usuario AS nome,
    cd_medico_tasy,
    CASE 
        WHEN cd_medico_tasy IS NOT NULL THEN '✅ Vinculado'
        ELSE '❌ Sem vínculo'
    END as status_integracao
FROM usuarios
WHERE cd_perfil_inicial = 2  -- Perfil "Médico"
ORDER BY nm_usuario;
```

### Ver agendas de um CD_MEDICO específico

```sql
-- Oracle (TASY)
SELECT 
    cd_agenda,
    TO_CHAR(dt_agenda, 'DD/MM/YYYY') AS data,
    hr_agenda AS hora,
    nm_paciente,
    ds_status_agenda AS status
FROM DC_CHAT_AGENDAS
WHERE CD_AGENDA IN (
    SELECT cd_agenda 
    FROM agenda 
    WHERE cd_medico = 12345  -- Substitua pelo CD_MEDICO
    AND IE_SITUACAO = 'A' 
    AND CD_TIPO_AGENDA = 3
    AND TRUNC(dt_agenda) = TRUNC(SYSDATE)
)
ORDER BY hr_agenda;
```

## 🚨 Troubleshooting

### Problema: "Código de médico (TASY) não cadastrado"

**Causa:** O usuário não tem `cd_medico_tasy` vinculado.

**Solução:** Configure conforme o passo 3 acima.

### Problema: Agenda vazia

**Causas possíveis:**

1. **CD_MEDICO errado** - Verifique no TASY se o código está correto
2. **Sem agendas hoje** - Tente mudar a data no filtro
3. **Agendas inativas** - Verifica `IE_SITUACAO = 'I'` no TASY

**Debug:**

```javascript
// Veja nos logs do servidor (terminal)
console.log('Buscando consultas para CD_MEDICO:', cdMedicoTasy);
console.log('Filtros:', { data, status });
```

### Problema: Usuário errado aparece

**Causa:** Dois usuários com o mesmo `cd_medico_tasy`.

**Solução:** Cada usuário deve ter um CD_MEDICO único (ou NULL).

```sql
-- Verificar duplicatas
SELECT cd_medico_tasy, COUNT(*) 
FROM usuarios 
WHERE cd_medico_tasy IS NOT NULL
GROUP BY cd_medico_tasy 
HAVING COUNT(*) > 1;
```

## 📋 Checklist de Setup

Para cada médico que vai usar o módulo Consultórios:

- [ ] Criar usuário no DataCare (`/pessoas/novo`)
- [ ] Descobrir o `CD_MEDICO` no TASY
- [ ] Vincular `cd_medico_tasy` ao usuário
- [ ] Testar login e acesso à agenda
- [ ] Verificar se as consultas aparecem corretamente

## 🔄 Diferença: CPF vs CD_MEDICO

| Campo | O que é | Usado para |
|-------|---------|------------|
| **nr_cpf** | CPF da pessoa | Identificação pessoal, relatórios |
| **cd_medico_tasy** | Código do médico no TASY | Buscar agendas, prontuários (integração) |

**Por que CD_MEDICO e não CPF?**

- ✅ Mais rápido (índice direto na agenda)
- ✅ Mais preciso (evita problemas com CPF formatado/sem formatação)
- ✅ Padrão do TASY (todas as queries usam CD_MEDICO)
- ✅ Único no sistema (CPF pode ter duplicatas por erro humano)

## 📚 Arquivos Relacionados

- **Migration:** `src/infra/database/migrations/20260127_add_cd_medico_to_usuarios.js`
- **Script:** `scripts/update-user-cd-medico.js`
- **Controller:** `src/controllers/consultoriosController.js` (método `buscarConsultas`)
- **Form:** `src/views/pages/pessoas/form.ejs`
- **Docs:** `docs/ARQUITETURA_CONSULTORIOS.md`

---

**Última atualização:** 27/01/2026  
**Versão:** 2.0 (mudança de CPF para CD_MEDICO)
