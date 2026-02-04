# Contrato de DTOs - Smart (Upload de Guia)

Documentação do formato de dados entre Frontend (EJS + Vanilla JS), Backend Node e Serviço Python.  
Stack do projeto: Node.js + Express + EJS + TailwindCSS + JavaScript (.cursorrules).

---

## Resposta do OCR (Python → Node)

Objeto retornado pelo microserviço em `POST /ocr/guia`:

```javascript
// ProcedimentoItem
{
  codigo_tuss: string,
  descricao: string
}

// GuiaOCROutput
{
  nome_paciente: string,
  numero_carteirinha?: string,
  codigo_operadora?: string,
  nome_operadora?: string,
  data_validade?: string,
  lista_procedimentos: ProcedimentoItem[],
  confidence_score: number,  // 0.0 a 1.0
  raw_text?: string
}
```

---

## Resposta da API para o Frontend (Node → EJS/JS)

`POST /api/atendimentos/upload-guia` → JSON:

```javascript
{
  success: true,
  data: {
    nome_paciente: string,
    numero_carteirinha: string,
    codigo_operadora: string,
    nome_operadora: string,
    data_validade: string,
    lista_procedimentos: Array<{ codigo_tuss: string, descricao: string }>,
    confidence_score: number,
    needs_manual_review: boolean,  // true se confidence < 0.85 ou erros de validação
    erros: Array<{ campo?: string, mensagem: string }>
  }
}
```

Quando o serviço de OCR está indisponível, o backend retorna **200** com `data` em modo fallback (campos vazios, `needs_manual_review: true`, mensagem em `erros`). Não retorna 503.

---

## Uso no frontend (Vanilla JS)

- Se `needs_manual_review === true`: exibir badge "Revisão manual recomendada" e destacar campos (borda amarela).
- Exibir `erros` abaixo do formulário quando houver.
- Script de cliente: `/public/js/smart-guia.js`.
