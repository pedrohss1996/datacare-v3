# 🔍 Troubleshooting: Discrepância entre Sistema e Oracle

## Problema
Query retorna 67-68 registros no sistema DataCare, mas apenas 64 no Oracle direto. Inclui convênio "Bradesco" que não existe no banco.

## ✅ Logs Adicionados

O sistema agora registra:
1. **Query SQL exata** sendo executada
2. **Quantidade de registros** retornados
3. **Primeiros 3 registros** (para debug)
4. **Lista de convênios** encontrados
5. **Status do cache** (se está usando cache ou dados frescos)

---

## 🔍 Como Investigar

### 1. Verificar Logs do Backend

Abra o console do servidor Node.js e procure por:

```
📝 [Analytics] Query SQL a ser executada:
SELECT * FROM tasy.painel_pa WHERE...
✅ [Analytics] Dashboard ID X: 67 registros carregados
🏥 [Analytics] Convênios encontrados (X): [...]
```

**Se aparecer:**
- `🚀 Dados carregados do CACHE` → **Problema: Cache desatualizado**
- `⏳ Executando query` → **Query sendo executada agora**

### 2. Verificar Cache

**Opção A: Limpar cache via API**
```bash
POST /api/analytics/cache/clear
```

**Opção B: Forçar refresh na URL**
```
/analytics/dashboard/ID?refresh=true
```

**Opção C: Limpar cache de um dashboard específico**
```bash
POST /api/analytics/cache/invalidate/:id
```

### 3. Comparar Query Executada

1. Copie a query exata dos logs do backend
2. Execute diretamente no Oracle:
```sql
-- Cole a query exata dos logs aqui
SELECT * FROM tasy.painel_pa 
WHERE dt_entrada BETWEEN TO_DATE('2026-02-19 00:00:00', 'YYYY-MM-DD HH24:MI:SS') 
                     AND TO_DATE('2026-02-19 23:59:59', 'YYYY-MM-DD HH24:MI:SS');
```

3. Compare os resultados:
   - Quantidade de registros
   - Convênios presentes
   - Dados dos registros

### 4. Verificar View `painel_pa`

A view pode ter:
- **Joins** que trazem registros extras
- **Unions** que combinam dados de outras tabelas
- **Filtros** diferentes do esperado
- **Dados históricos** ou **soft deletes**

**Verificar estrutura da view:**
```sql
SELECT text 
FROM all_views 
WHERE view_name = 'PAINEL_PA' 
AND owner = 'TASY';
```

### 5. Verificar Transformações de Dados

O sistema pode estar:
- **Convertendo tipos** (strings para números)
- **Adicionando campos calculados**
- **Filtrando/agrupando** dados

**Verificar nos logs:**
```
🔍 [Analytics] Primeiros 3 registros: {...}
```

---

## 🚨 Possíveis Causas

### 1. **Cache Desatualizado** (Mais Provável)
- **Sintoma**: Dados diferentes entre execuções
- **Solução**: Limpar cache ou usar `?refresh=true`

### 2. **View com Joins/Unions**
- **Sintoma**: Mais registros que o esperado
- **Solução**: Verificar estrutura da view `painel_pa`

### 3. **Dados Mockados/Teste**
- **Sintoma**: Convênio "Bradesco" que não existe
- **Solução**: Verificar se há dados de teste sendo injetados

### 4. **Timezone/Datas**
- **Sintoma**: Datas diferentes entre sistemas
- **Solução**: Verificar timezone do servidor vs Oracle

### 5. **Soft Deletes**
- **Sintoma**: Registros que deveriam estar excluídos
- **Solução**: Verificar se há campo de exclusão lógica

---

## 🛠️ Solução Rápida

### Passo 1: Limpar Cache
```bash
# Via API
curl -X POST http://localhost:3000/api/analytics/cache/clear \
  -H "Cookie: session=..."
```

### Passo 2: Forçar Refresh
Acesse o dashboard com:
```
/analytics/dashboard/ID?refresh=true
```

### Passo 3: Verificar Logs
Observe os logs do backend para:
- Query exata executada
- Quantidade de registros
- Convênios encontrados

### Passo 4: Comparar com Oracle
Execute a mesma query diretamente no Oracle e compare.

---

## 📊 Verificar Estatísticas do Cache

```bash
GET /api/analytics/cache/stats
```

Retorna:
- Quantidade de itens em cache
- Idade de cada cache
- TTL (tempo de vida)
- Se está expirado

---

## 🔧 Debug Avançado

### Adicionar Logs Temporários

No arquivo `src/controllers/AnalyticsController.js`, linha ~2141:

```javascript
// Após executar query
console.log('🔍 [DEBUG] Total de registros Oracle:', data.length);
console.log('🔍 [DEBUG] Query executada:', widget.query_sql);
console.log('🔍 [DEBUG] Primeiro registro:', JSON.stringify(data[0], null, 2));

// Verificar convênios únicos
const convenios = [...new Set(data.map(r => r.NM_CONVENIO || r.CONVENIO || 'N/A'))];
console.log('🔍 [DEBUG] Convênios únicos:', convenios);
```

---

## ✅ Checklist de Verificação

- [ ] Cache foi limpo?
- [ ] Query executada é idêntica à do Oracle?
- [ ] View `painel_pa` tem joins/unions?
- [ ] Há dados de teste sendo injetados?
- [ ] Timezone está correto?
- [ ] Há soft deletes não considerados?
- [ ] Logs mostram quantidade correta?

---

## 💡 Próximos Passos

1. **Execute a query com `?refresh=true`** para ignorar cache
2. **Compare os logs** com a query direta no Oracle
3. **Verifique a estrutura da view** `painel_pa`
4. **Reporte os resultados** para análise mais profunda
