# Arquitetura do Módulo Consultórios

## 🏗️ Visão Geral

O módulo de Consultórios utiliza uma arquitetura híbrida:

- **Oracle (TASY)**: Apenas para **LEITURA** de dados (consultas agendadas, pacientes)
- **PostgreSQL (DataCare)**: Para **ESCRITA** de dados (prontuários, anotações, histórico)

## 📊 Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────┐
│                    MÓDULO CONSULTÓRIOS                       │
└─────────────────────────────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
         ┌──────▼──────┐          ┌──────▼──────┐
         │   ORACLE    │          │ POSTGRESQL  │
         │   (TASY)    │          │  (DataCare) │
         └──────┬──────┘          └──────┬──────┘
                │                         │
         ┌──────▼──────┐          ┌──────▼──────┐
         │   LEITURA   │          │   ESCRITA   │
         │   (SELECT)  │          │ (INSERT/    │
         │             │          │  UPDATE)    │
         └─────────────┘          └─────────────┘
              │                         │
         ┌────▼────────┐          ┌─────▼────────┐
         │ • Agenda    │          │ • Prontuários│
         │ • Pacientes │          │ • Anotações  │
         │ • Consultas │          │ • Histórico  │
         │ • Convênios │          │ • Evolução   │
         └─────────────┘          └──────────────┘
```

## 🔍 Oracle (TASY) - Somente Leitura

### Tabelas consultadas:

1. **pessoa_fisica** (TASY)
   - `cd_pessoa_fisica`, `nr_cpf`, `nm_pessoa_fisica`
   - Busca médico por CPF

2. **agenda** (TASY)
   - `cd_agenda`, `cd_pessoa_fisica`, `ie_situacao`, `cd_tipo_agenda`
   - Lista agendas do médico (tipo 3 = consultas)

3. **DC_CHAT_AGENDAS** (View TASY)
   - `nr_sequencia`, `hr_agenda`, `nm_paciente`, `cd_convenio`, `ds_convenio`
   - Dados completos das consultas agendadas

### Queries de exemplo:

```sql
-- Buscar consultas do médico (CPF: 87209829172)
SELECT 
    NR_SEQUENCIA AS ID_AGENDA,
    HR_AGENDA AS HORA,
    IE_STATUS_AGENDA AS STATUS,
    NM_PACIENTE AS NOME_PACIENTE,
    DS_CONVENIO AS CONVENIO,
    DT_AGENDA AS DATA_AGENDA
FROM DC_CHAT_AGENDAS
WHERE CD_AGENDA IN (
    SELECT cd_agenda 
    FROM agenda 
    WHERE cd_pessoa_fisica = (
        SELECT cd_pessoa_fisica 
        FROM pessoa_fisica 
        WHERE nr_cpf = '87209829172'
    ) 
    AND IE_SITUACAO = 'A' 
    AND CD_TIPO_AGENDA = 3
)
AND TRUNC(DT_AGENDA) = TRUNC(SYSDATE)
ORDER BY HR_AGENDA;
```

## 💾 PostgreSQL (DataCare) - Leitura e Escrita

### Tabelas do módulo (a serem criadas):

1. **consultorios_prontuarios**
   ```sql
   cd_prontuario SERIAL PRIMARY KEY
   cd_usuario INTEGER (FK → usuarios)
   cd_agenda_tasy INTEGER (referência ao TASY)
   nm_paciente VARCHAR
   dt_atendimento TIMESTAMP
   ds_queixa TEXT
   ds_exame_fisico TEXT
   ds_diagnostico TEXT
   ds_conduta TEXT
   ds_observacoes TEXT
   dt_criacao TIMESTAMP
   dt_atualizacao TIMESTAMP
   ```

2. **consultorios_evolucoes**
   ```sql
   cd_evolucao SERIAL PRIMARY KEY
   cd_prontuario INTEGER (FK → consultorios_prontuarios)
   cd_usuario INTEGER (FK → usuarios)
   dt_evolucao TIMESTAMP
   ds_evolucao TEXT
   dt_criacao TIMESTAMP
   ```

3. **consultorios_anexos**
   ```sql
   cd_anexo SERIAL PRIMARY KEY
   cd_prontuario INTEGER (FK → consultorios_prontuarios)
   cd_usuario INTEGER (FK → usuarios)
   nm_arquivo VARCHAR
   ds_tipo VARCHAR
   ds_caminho TEXT
   dt_upload TIMESTAMP
   ```

## 🔄 Fluxo de Trabalho

### 1. Visualizar Agenda (ORACLE - Leitura)

```javascript
// Controller: consultoriosController.buscarConsultas
// 1. Busca CPF do médico no PostgreSQL (usuarios)
const userDb = await db('usuarios').where({ cd_usuario: user.id }).first();

// 2. Consulta agenda no Oracle (TASY)
const consultas = await db.oracle.raw(`
    SELECT ... FROM DC_CHAT_AGENDAS WHERE ...
`);
```

### 2. Abrir Atendimento (Misto)

```javascript
// 1. Busca dados do paciente no TASY (Oracle - Leitura)
const paciente = await db.oracle.raw(`
    SELECT nm_paciente, nr_cpf, dt_nascimento 
    FROM DC_CHAT_AGENDAS WHERE cd_agenda = :id
`);

// 2. Busca prontuário existente no PostgreSQL (Leitura)
const prontuario = await db('consultorios_prontuarios')
    .where({ cd_agenda_tasy: id })
    .first();

// 3. Se não existir, renderiza formulário vazio
// 4. Se existir, carrega dados salvos
```

### 3. Salvar Prontuário (POSTGRESQL - Escrita)

```javascript
// Salva APENAS no PostgreSQL
await db('consultorios_prontuarios').insert({
    cd_usuario: user.id,
    cd_agenda_tasy: agendaId,
    nm_paciente: paciente.nome,
    dt_atendimento: new Date(),
    ds_queixa: req.body.queixa,
    ds_exame_fisico: req.body.exame,
    ds_diagnostico: req.body.diagnostico,
    ds_conduta: req.body.conduta,
    dt_criacao: new Date()
});
```

## ⚠️ Regras Importantes

### ✅ PODE (Oracle)
- ✅ SELECT (consultar dados)
- ✅ Buscar agendas
- ✅ Buscar dados de pacientes
- ✅ Buscar convênios
- ✅ Buscar histórico do TASY

### ❌ NÃO PODE (Oracle)
- ❌ INSERT (criar registros)
- ❌ UPDATE (atualizar registros)
- ❌ DELETE (excluir registros)
- ❌ Modificar qualquer dado do TASY

### ✅ PODE (PostgreSQL)
- ✅ INSERT (criar prontuários, evoluções, anexos)
- ✅ UPDATE (atualizar prontuários)
- ✅ DELETE (excluir anotações)
- ✅ SELECT (consultar dados salvos)

## 🔗 Vínculo entre bancos

O vínculo é feito através de:

1. **CPF do médico**
   - PostgreSQL: `usuarios.nr_cpf` ou `pessoa_fisica.nr_cpf`
   - Oracle: `pessoa_fisica.nr_cpf`

2. **CD_AGENDA (referência)**
   - Oracle: `agenda.cd_agenda` (ID único da agenda no TASY)
   - PostgreSQL: `consultorios_prontuarios.cd_agenda_tasy` (referência, não FK)

**Importante:** Não há FOREIGN KEY entre bancos! A referência é apenas lógica.

## 📝 Exemplo Completo

### Cenário: Médico atende paciente

1. **Médico acessa agenda** → Busca no TASY (Oracle)
2. **Clica em "Ver Detalhes"** → Busca consulta no TASY (Oracle)
3. **Abre formulário de prontuário** → Busca prontuário no PostgreSQL
4. **Preenche dados e salva** → INSERT no PostgreSQL
5. **Adiciona evolução** → INSERT no PostgreSQL
6. **Anexa documento** → INSERT no PostgreSQL + Upload de arquivo

### Código de exemplo:

```javascript
// 1. Buscar consulta (Oracle)
const consulta = await db.oracle.raw(`
    SELECT * FROM DC_CHAT_AGENDAS 
    WHERE CD_AGENDA = :id
`, { id: agendaId });

// 2. Salvar prontuário (PostgreSQL)
await db('consultorios_prontuarios').insert({
    cd_usuario: medicoId,
    cd_agenda_tasy: agendaId, // ← Referência ao TASY
    nm_paciente: consulta.NM_PACIENTE,
    ds_queixa: 'Dor de cabeça há 3 dias',
    ds_diagnostico: 'Cefaleia tensional',
    dt_criacao: new Date()
});

// 3. Adicionar evolução (PostgreSQL)
await db('consultorios_evolucoes').insert({
    cd_prontuario: prontuarioId,
    cd_usuario: medicoId,
    ds_evolucao: 'Paciente retorna com melhora',
    dt_criacao: new Date()
});
```

## 🚀 Resumo

| Operação | Banco | Tipo |
|----------|-------|------|
| Buscar agendas | Oracle | SELECT |
| Buscar dados do paciente | Oracle | SELECT |
| Salvar prontuário | PostgreSQL | INSERT |
| Atualizar prontuário | PostgreSQL | UPDATE |
| Adicionar evolução | PostgreSQL | INSERT |
| Anexar arquivo | PostgreSQL | INSERT |
| Buscar histórico TASY | Oracle | SELECT |
| Buscar histórico DataCare | PostgreSQL | SELECT |

**Regra de ouro:** Oracle é o espelho do hospital (TASY), PostgreSQL é o caderno do médico (DataCare).
