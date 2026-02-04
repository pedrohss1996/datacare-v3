# DataCare - Serviço de OCR para Guias TISS

Microserviço Python (FastAPI) que processa imagens de guias de atendimento e retorna dados estruturados.

## Versão do Python

**Use Python 3.10, 3.11 ou 3.12.** Python 3.14 (e 3.13) ainda não têm wheels para pydantic/opencv; o pip tenta compilar e exige Rust.

Se você usa **Python 3.14**: instale o **Python 3.11** ou **3.12** em paralelo em https://www.python.org/downloads/ e crie o venv com ele (veja abaixo).

## Uso

No PowerShell:

```powershell
cd services/guia-ocr
# Se tiver Python 3.11 ou 3.12 instalado (recomendado):
py -3.11 -m venv .venv
# ou: py -3.12 -m venv .venv

.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Se só tiver Python 3.10: `python -m venv .venv` e depois `pip install -r requirements.txt`.

- **Health:** `GET http://localhost:8000/health`
- **OCR:** `POST http://localhost:8000/ocr/guia` com `multipart/form-data` e campo `file` (JPG/PNG).

## Análise real do documento (sem dados mockados)

O serviço **só faz análise real** da imagem. Não há dados simulados: se não houver motor de OCR instalado, o texto retornado será vazio e o formulário virá para preenchimento manual.

Para **extrair texto de verdade** da guia:

1. **Instale o binário Tesseract** no sistema (com suporte a português):
   - **Windows:** https://github.com/UB-Mannheim/tesseract/wiki — baixe o instalador e marque o idioma **por** (Portuguese).
   - Depois de instalar, adicione a pasta do Tesseract ao PATH (ex.: `C:\Program Files\Tesseract-OCR`) ou configure no código se necessário.

2. **Pacotes Python** (já estão no `requirements.txt`): `pytesseract`, `Pillow`, `opencv-python-headless` (pré-processamento).

3. Envie uma **imagem nítida** da guia (JPG/PNG). O fluxo é: pré-processamento (OpenCV) → OCR (Tesseract) → **(opcional) Gemini** organiza os dados → JSON.

Se o Tesseract não estiver instalado ou a imagem não tiver texto legível, a API ainda responde 200 com campos vazios e `needs_manual_review: true` para o usuário preencher manualmente.

### Extração com Gemini (obrigatório no fluxo atual)

O serviço usa **somente** a API Gemini Vision: a imagem é enviada ao Google e os dados voltam estruturados. É necessário definir **GEMINI_API_KEY** no `.env`. Chave gratuita em: https://aistudio.google.com/apikey

### Custo zero (free tier)

- A API Gemini tem **tier gratuito**: não exige cartão de crédito.
- Limites típicos do free tier: até ~1.000 requisições/dia e 5–15 requisições/minuto (podem variar).
- Uso leve (dezenas de guias por dia) permanece **sem custo**. Você não será cobrado enquanto estiver dentro da cota gratuita.
- Se passar do limite, o Google pode bloquear temporariamente ou pedir ativação de billing; para **garantir zero gasto**, use com moderação (poucas dezenas de guias/dia).

O script `npm run ocr` (e `npm run dev`) carrega o `.env` da raiz e repassa a variável ao serviço Python.

## Variáveis de ambiente

- **GEMINI_API_KEY** (obrigatório): chave da API Google AI (Gemini). Obtenha em https://aistudio.google.com/apikey — free tier disponível.
- **GEMINI_MODEL** (opcional): modelo a usar, ex. `gemini-2.5-flash` (padrão) ou `gemini-2.5-pro`.
- **GEMINI_PROMPT** (opcional): `faturamento` (padrão) = especialista TISS, JSON puro, datas YYYY-MM-DD, float para valores; `short` = prompt curto; `full` = prompt longo por regiões.
- **PREPROCESS_IMAGE** (opcional): `0` ou `false` (padrão) = imagem quase original; `1` ou `true` = deskew, denoise, contraste e nitidez; `tiss` = pipeline para OCR (grayscale, deskew, Otsu, remoção de linhas de tabela).
- Para produção, configure CORS se necessário.

### Pipeline TISS (tratamento de imagem para OCR)

Quando `PREPROCESS_IMAGE=tiss`, o serviço aplica o pipeline pensado para guias com tabelas e fontes pequenas:

1. **Grayscale e deskew** – alinhamento do documento.
2. **Otsu (adaptive thresholding)** – remove sombras (fotos de celular) e binariza por região.
3. **Dilatação/erosão (box removal)** – remove linhas de tabela para o OCR não confundir `|` com `1` ou `l`.

Use `tiss` se no futuro usar OCR (Tesseract) em vez de só Gemini Vision. Para Gemini, `0` ou `1` costumam ser suficientes.
