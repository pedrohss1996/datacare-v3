# 🔍 Troubleshooting: Agenda Vazia

## Problema

Usuário vinculado ao CD_MEDICO, mas nenhuma consulta aparece na agenda.

---

## ✅ Checklist de Diagnóstico

### 1. Verificar se o CD_MEDICO está vinculado corretamente

```sql
-- Execute no PostgreSQL (DataCare)
SELECT 
    cd_usuario,
    nm_usuario,
    ds_usuario,
    cd_medico_tasy
FROM usuarios
WHERE nm_usuario = 'marlonmedico';  -- Substitua pelo seu usuário
```

**Resultado esperado:** `cd_medico_tasy` deve ter um valor (ex: 12345)

❌ **Se estiver NULL:** Edite o usuário em `/pessoas` e adicione o código.

---

### 2. Verificar se o CD_MEDICO tem agendas no TASY

```sql
-- Execute no Oracle (TASY)
SELECT COUNT(*) as TOTAL_AGENDAS
FROM agenda
WHERE cd_medico = 12345  -- Substitua pelo seu CD_MEDICO
  AND IE_SITUACAO = 'A'
  AND CD_TIPO_AGENDA = 3;
```

**Resultado esperado:** `TOTAL_AGENDAS` > 0

❌ **Se for 0:** 
- CD_MEDICO está errado, OU
- O médico não tem agendas cadastradas

---

### 3. Verificar se há agendas para a data filtrada

```sql
-- Execute no Oracle (TASY)
SELECT COUNT(*) as AGENDAS_HOJE
FROM agenda
WHERE cd_medico = 12345  -- Substitua pelo seu CD_MEDICO
  AND IE_SITUACAO = 'A'
  AND CD_TIPO_AGENDA = 3
  AND TRUNC(dt_agenda) = TRUNC(SYSDATE);  -- Hoje
```

**Resultado esperado:** `AGENDAS_HOJE` > 0

❌ **Se for 0:** 
- Não há agendas para hoje
- Tente mudar a data no filtro da tela

---

### 4. Verificar se a view DC_CHAT_AGENDAS está atualizada

```sql
-- Execute no Oracle (TASY)
SELECT 
    CD_AGENDA,
    HR_AGENDA,
    NM_PACIENTE,
    DS_STATUS_AGENDA,
    DT_AGENDA
FROM DC_CHAT_AGENDAS
WHERE CD_AGENDA IN (
    SELECT cd_agenda 
    FROM agenda 
    WHERE cd_medico = 12345  -- Substitua
    AND IE_SITUACAO = 'A'
    AND CD_TIPO_AGENDA = 3
)
AND TRUNC(DT_AGENDA) = TRUNC(SYSDATE)
ORDER BY HR_AGENDA;
```

**Resultado esperado:** Deve retornar as consultas do dia

❌ **Se estiver vazio:** A view `DC_CHAT_AGENDAS` pode estar desatualizada

---

### 5. Verificar logs do servidor (Backend)

Após acessar `/consultorios/agenda`, verifique os logs no terminal:

```bash
🔍 DEBUG Agenda:
   - Usuário ID: 2303
   - Usuário Nome: marlonmedico
   - CD_MEDICO_TASY: 12345
   
📋 Executando query Oracle:
   - CD_MEDICO: 12345
   - Data: 2026-01-30
   - Status: todos
   
✅ Query executada com sucesso!
   - Consultas retornadas: 0
```

**Analise:**
- `CD_MEDICO_TASY` está preenchido? ✅
- Query foi executada? ✅
- Consultas retornadas = 0? ❌ **Problema na query ou dados**

---

### 6. Verificar console do navegador (Frontend)

Pressione **F12** → Aba **Console**

**Erros comuns:**

#### Erro: "Código de médico (TASY) não cadastrado"
```javascript
{
  error: "Código de médico (TASY) não cadastrado...",
  success: false
}
```

**Solução:** O `cd_medico_tasy` não foi salvo. Edite novamente o usuário.

#### Erro: 500 Internal Server Error
```javascript
GET /api/consultorios/agenda/consultas?data=... 500 (Internal Server Error)
```

**Solução:** Verifique os logs do servidor. Pode ser erro de conexão com Oracle.

#### Sem erros, mas agenda vazia
```javascript
{
  success: true,
  data: [],
  estatisticas: { total: 0, ... }
}
```

**Solução:** A query retornou vazio. Execute os testes SQL acima.

---

## 🧪 Script de Teste Automático

Execute o script de diagnóstico:

```bash
node scripts/test-agenda-cd-medico.js 12345 2026-01-30
```

Substitua:
- `12345` pelo seu CD_MEDICO
- `2026-01-30` pela data que deseja testar (opcional, padrão = hoje)

**Exemplo de saída:**

```
🔍 Testando busca de agendas
   CD_MEDICO: 12345
   Data: 2026-01-30

📊 TESTE 1: Verificando agendas do médico no TASY...
   Total de agendas (todos os períodos): 45

📊 TESTE 2: Verificando agendas do dia específico...
   Total de agendas do dia 2026-01-30: 8

📊 TESTE 3: Buscando na view DC_CHAT_AGENDAS...
   ✅ Consultas encontradas: 8

📋 Primeiras 5 consultas:
   1. 08:00:00 - JOÃO SILVA [Agendada]
   2. 09:00:00 - MARIA SANTOS [Em Atendimento]
   ...

📊 TESTE 4: Verificando vínculo no DataCare...
   ✅ Usuários vinculados a este CD_MEDICO:
      - marlonmedico (Dr. Marlon Médico) - ID: 2303

✅ Teste concluído!
```

---

## 🔧 Soluções Comuns

### Problema: CD_MEDICO errado

**Como descobrir o CD_MEDICO correto:**

```sql
-- Liste todos os médicos com agendas hoje
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

**Correção:**
1. Encontre o CD_MEDICO correto
2. Edite o usuário em `/pessoas`
3. Atualize o campo "Código Médico (TASY)"

---

### Problema: View DC_CHAT_AGENDAS desatualizada

**Solução:** Peça ao DBA para atualizar a view ou verificar se ela está funcionando.

**Teste alternativo (sem a view):**

```sql
-- Busca diretamente na tabela agenda
SELECT 
    a.cd_agenda,
    a.dt_agenda,
    a.hr_agenda,
    pf.nm_pessoa_fisica as NM_PACIENTE
FROM agenda a
LEFT JOIN atendimento_paciente ap ON a.cd_agenda = ap.cd_agenda
LEFT JOIN pessoa_fisica pf ON ap.cd_pessoa_fisica = pf.cd_pessoa_fisica
WHERE a.cd_medico = 12345
  AND a.ie_situacao = 'A'
  AND a.cd_tipo_agenda = 3
  AND TRUNC(a.dt_agenda) = TRUNC(SYSDATE)
ORDER BY a.hr_agenda;
```

---

### Problema: Conexão Oracle falhou

**Erro no terminal:**
```
Error: ORA-12170: TNS:Connect timeout occurred
```

**Solução:**
1. Verifique se o Oracle está acessível
2. Teste a conexão: `sqlplus usuario/senha@tasy`
3. Verifique as credenciais no `.env`:
   ```
   ORACLE_USER=seu_usuario
   ORACLE_PASSWORD=sua_senha
   ORACLE_CONNECT_STRING=seu_tns
   ```

---

## 📞 Suporte

Se nada funcionar, colete as seguintes informações:

1. **Logs do servidor** (últimas 50 linhas)
2. **Console do navegador** (F12 → Console → Screenshot)
3. **Resultado dos testes SQL** (passos 1-4)
4. **Resultado do script de teste** (`test-agenda-cd-medico.js`)

E abra um chamado com essas informações.

---

**Última atualização:** 30/01/2026
