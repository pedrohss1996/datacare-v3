# Smart – Workflow: pixels → dados estruturados validados

Este documento descreve o fluxo de integração da guia SP/SADT no DataCare: tratamento de imagem, extração, Sanity Check e validação do DTO.

## Visão geral

1. **Frontend**: Dropzone + preview → upload → loading "Analisando layout da guia..." → formulário por seções (Beneficiário, Prestador, Itens, Totais) para conferência/edição.
2. **Backend Node**: Recebe o upload, chama o microserviço de OCR/IA, aplica **Sanity Check** e monta o DTO.
3. **Microserviço Python**: Tratamento de imagem (opcional) + Gemini Vision → JSON estruturado TISS.

## Tratamento de imagem (backend Python)

O pipeline de imagem pode ser escolhido via `PREPROCESS_IMAGE` (`.env` ou ambiente do serviço OCR):

| Valor | Comportamento |
|-------|----------------|
| `0` ou `false` (padrão) | Imagem quase original; só redimensiona se > 4096px. Ideal para Gemini Vision (igual ao que você cola no chat). |
| `1` ou `true` | Deskew, normalização de brilho, denoise, CLAHE, nitidez, resize. |
| `tiss` | Pipeline para OCR (Tesseract etc.): **Grayscale → Deskew → Otsu (adaptive threshold) → Box removal (linhas de tabela)**. Reduz confusão de `\|` com `1` ou `l` em guias com tabelas. |

- **Otsu**: binarização por região; remove sombras (fotos de celular).
- **Box removal**: morfologia (kernels horizontal/vertical) para remover linhas da tabela antes do OCR.

## Sanity Check (Node – guiaService.js)

Após receber o JSON do microserviço, o backend Node aplica:

1. **CNES**: Se `CNES_VALIDOS` estiver definido no `.env` (ex.: `3546551,1234567`), valida se o CNES extraído pertence à rede (ex.: Hospital Anis Rassi). Caso contrário, não valida CNES.
2. **Soma dos totais**: Verifica se (Campo 59 + 60 + 61 + 63) ≈ Campo 65 (Total Geral), com tolerância de R$ 0,02 (arredondamento).
3. **Datas em ISO 8601**: Gera campos `data_autorizacao_iso`, `data_validade_iso`, etc. (AAAA-MM-DD) para banco/API.
4. **Números**: Garante que `total_procedimentos`, `total_taxas`, `total_materiais`, `total_medicamentos`, `total_geral` e `valor` dos itens sejam `Number`.
5. **Strings saneadas**: Trim em todos os campos string; Senha e Nº Guia sem espaços; itens da lista com `codigo_tuss` e `descricao` como string trim e `valor` como número.

Variáveis de ambiente (Node):

- **CNES_VALIDOS** (opcional): lista de CNES permitidos separados por vírgula. Ex.: `CNES_VALIDOS=3546551,1234567`.
- **OPERADORAS_VALIDAS** (opcional): códigos ANS permitidos. Ex.: `OPERADORAS_VALIDAS=005622,12345`.

## Frontend – seções do formulário

O formulário de conferência está organizado por blocos TISS:

- **Dados da Guia Principal** (1–7)
- **Beneficiário** (8–12)
- **Solicitante** (13–19)
- **Solicitação** (21–23)
- **Procedimentos Solicitados** (24–28)
- **Status e Faturamento** (59–65)
- **Observação** (58)

Há também a **Tabela TISS** com todos os campos extraídos (Nº, Campo, Valor) para auditoria.

## Lotes e processamento assíncrono (futuro)

Para receber **várias guias de uma vez** (ex.: 50 guias), o ideal é não processar tudo de forma síncrona. Sugestão de arquitetura:

1. **Upload em lote**: Frontend envia múltiplos arquivos; backend cria um **job** e retorna um `jobId`.
2. **Processamento em segundo plano**: Fila (ex.: Bull/Redis ou fila no banco) processa cada guia (chamada ao microserviço OCR + Sanity Check).
3. **Atualização da UI**: Via **Supabase Realtime**, **Socket.io** ou polling: quando o job termina, o frontend atualiza a lista (ex.: “3/50 concluídos”, depois “50/50 – conferir dados”).

O código atual (upload único → resposta síncrona) permanece; a extensão para jobId + webhooks/sockets pode ser feita em uma próxima etapa.
