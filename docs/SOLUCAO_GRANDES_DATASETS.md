# 🚀 Solução para Grandes Datasets (6+ anos de dados)

## Problema
Queries que trazem milhões de registros (até 6 anos de dados) causam:
- Timeout no backend
- Consumo excessivo de memória
- Interface travada
- Experiência ruim do usuário

## ✅ Solução Implementada

### 1. **Validação de Filtros de Data (Obrigatório)**
- Sistema detecta automaticamente se a query tem filtro de data
- Se não tiver, **força limite de segurança** (10k registros)
- Mensagem clara ao usuário: "Adicione filtro de data na query"

### 2. **LargeDatasetHandler**
- **Batch Processing**: Divide queries grandes em batches de 10k registros
- **Cache Inteligente**: Cache de 1 hora para queries grandes
- **Progresso em Tempo Real**: Callbacks de progresso durante execução
- **Limite Máximo**: 500k registros (configurável)

### 3. **Execução Inteligente**
- **< 10k registros**: Execução normal
- **10k - 50k registros**: QueryStreamer (batch mode)
- **> 50k registros**: LargeDatasetHandler (streaming progressivo)

### 4. **Streaming Progressivo**
- Endpoint `/api/analytics/stream-progressive`
- Retorna dados em chunks (NDJSON)
- Frontend recebe dados progressivamente
- Não trava a interface

---

## 📋 Como Usar

### Backend (Automático)
O sistema detecta automaticamente queries grandes e aplica a estratégia correta:

```javascript
// Exemplo: Query com 200k registros
const sql = `
  SELECT * FROM ATENDIMENTOS 
  WHERE DT_ENTRADA >= TRUNC(SYSDATE) - 365 * 6  -- 6 anos
  ORDER BY DT_ENTRADA DESC
`;

// Sistema automaticamente:
// 1. Detecta que é query grande (>50k)
// 2. Usa LargeDatasetHandler
// 3. Executa em batches de 10k
// 4. Cacheia resultado (1 hora)
// 5. Retorna progresso em tempo real
```

### Frontend (Streaming Progressivo)
Para queries muito grandes, use o endpoint de streaming:

```javascript
async function loadLargeDataset(sqlQuery) {
  const response = await fetch('/api/analytics/stream-progressive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sqlQuery })
  });
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let allData = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Mantém linha incompleta
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      const obj = JSON.parse(line);
      
      if (obj.type === 'progress') {
        console.log(`Progresso: ${obj.progress.toFixed(1)}%`);
        updateProgressBar(obj.progress);
      } else if (obj.type === 'chunk') {
        allData.push(...obj.data);
        updateDashboard(allData); // Atualiza dashboard progressivamente
      } else if (obj.type === 'end') {
        console.log(`✅ Completo: ${obj.total} registros`);
      }
    }
  }
}
```

---

## ⚙️ Configurações

### Limites (src/utils/largeDatasetHandler.js)
```javascript
{
  maxRows: 500000,      // Máximo de 500k registros
  batchSize: 10000,     // 10k registros por batch
  cacheTTL: 3600000     // 1 hora de cache
}
```

### Thresholds (src/controllers/AnalyticsController.js)
```javascript
{
  smallQuery: 10000,    // < 10k: execução normal
  mediumQuery: 50000,   // 10k-50k: QueryStreamer
  largeQuery: 50000     // > 50k: LargeDatasetHandler
}
```

---

## 🔍 Validação de Filtros

### Padrões Detectados
- `DT_ENTRADA`, `DT_ALTA`, `DT_AGENDA`
- `DT_NASCIMENTO`, `DT_ATUALIZACAO`
- `DATA_*`, `DATE_*`
- `TRUNC(SYSDATE)`, `TO_DATE`

### Exemplo de Query Válida
```sql
SELECT * FROM ATENDIMENTOS 
WHERE DT_ENTRADA >= TRUNC(SYSDATE) - 365 * 2  -- ✅ Tem filtro de data
ORDER BY DT_ENTRADA DESC
FETCH FIRST 50000 ROWS ONLY  -- ✅ Tem limite
```

### Exemplo de Query Inválida
```sql
SELECT * FROM ATENDIMENTOS  -- ❌ Sem filtro de data
ORDER BY DT_ENTRADA DESC
-- ❌ Sem limite
```

**Resultado**: Sistema adiciona `FETCH FIRST 10000 ROWS ONLY` automaticamente.

---

## 💾 Cache

### Estratégia
- **Chave**: Hash MD5 da query SQL
- **TTL**: 1 hora (3600000ms)
- **Armazenamento**: Memória (cacheDashboards)

### Invalidação
```javascript
// Limpar cache de um dashboard
POST /api/analytics/cache/invalidate/:id

// Limpar todo cache
POST /api/analytics/cache/clear
```

---

## 📊 Monitoramento

### Logs do Backend
```
🌊 [LargeDataset] Executando query grande (máx 500000 registros)...
📦 [LargeDataset] Batch 1: offset 0, fetch 10000
✅ [LargeDataset] Batch 1: 10000 registros (total: 10000)
📦 [LargeDataset] Batch 2: offset 10000, fetch 10000
✅ [LargeDataset] Batch 2: 10000 registros (total: 20000)
...
✅ [LargeDataset] Completo: 200000 registros em 20 batches (45000ms)
💾 [LargeDataset] Dados salvos no cache (200000 registros)
```

### Progresso no Frontend
```javascript
{
  type: 'progress',
  batchNum: 5,
  batchSize: 10000,
  totalProcessed: 50000,
  progress: 10.0
}
```

---

## 🚨 Avisos e Erros

### Query Sem Filtro de Data
```
⚠️ [Query] Query sem filtro de data detectada. Adicionando limite de segurança...
```

### Limite Atingido
```
⚠️ [LargeDataset] Limite de 500000 registros atingido
```

### Cache Hit
```
✅ [LargeDataset] Cache hit: 200000 registros
```

---

## 🎯 Boas Práticas

1. **Sempre use filtros de data** em queries grandes
2. **Use limites** quando possível (`FETCH FIRST N ROWS`)
3. **Monitore o cache** para queries frequentes
4. **Use streaming progressivo** para datasets > 100k
5. **Implemente paginação virtual** no frontend para visualização

---

## 🔧 Troubleshooting

### Query muito lenta
- Verifique índices no Oracle
- Adicione filtros mais restritivos
- Use `FETCH FIRST` para limitar resultados

### Memória insuficiente
- Reduza `maxRows` em `largeDatasetHandler.js`
- Reduza `batchSize`
- Use streaming progressivo no frontend

### Cache não funciona
- Verifique se `cacheKey` está sendo gerado corretamente
- Verifique TTL do cache
- Limpe cache manualmente se necessário
