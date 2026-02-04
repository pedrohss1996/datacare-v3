# Smart – Análise real da guia com Tesseract (passo a passo)

Você já instalou o **Tesseract** com o pacote de **português**. Siga os passos abaixo para usar a análise real no DataCare.

---

## 1. Onde o Tesseract foi instalado

No Windows, o instalador costuma colocar o Tesseract em:

- **`C:\Program Files\Tesseract-OCR\tesseract.exe`**
- ou **`C:\Program Files (x86)\Tesseract-OCR\tesseract.exe`**

O código do serviço de OCR já procura nesses caminhos. Se você instalou em outra pasta, anote o caminho completo do **`tesseract.exe`** (vamos usar no passo 4, se precisar).

---

## 2. Ambiente Python do serviço de OCR

O serviço de OCR roda em um **venv** dentro de `services/guia-ocr`. Use **Python 3.10, 3.11 ou 3.12** (evite 3.13/3.14).

No **PowerShell**, na raiz do projeto:

```powershell
cd C:\Users\PC RYZEN\Documents\datacare-app\services\guia-ocr
```

**Se ainda não criou o venv:**

```powershell
py -3.11 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

**Se o venv já existe:**

```powershell
.venv\Scripts\activate
pip install -r requirements.txt
```

Isso garante que estão instalados: **pytesseract**, **Pillow**, **opencv-python-headless**, **FastAPI**, **uvicorn**, **pydantic**.

---

## 3. Testar se o Tesseract é encontrado pelo Python

Ainda com o venv ativado (`(.venv)` no prompt):

```powershell
python -c "import pytesseract; print(pytesseract.get_tesseract_version())"
```

- Se aparecer um **número de versão** (ex.: `5.3.0`): o Python está encontrando o Tesseract. Pode seguir para o passo 4.
- Se der **erro** (ex.: `TesseractNotFoundError` ou "tesseract is not installed"):
  - Ou o Tesseract não está no **PATH**, ou está em outra pasta.
  - Nesse caso, no passo 4 você pode definir o caminho manualmente.

**Verificar idioma português:**

```powershell
python -c "import pytesseract; print(pytesseract.get_languages())"
```

Deve aparecer **`por`** na lista. Se não aparecer, reinstale o Tesseract e marque o pacote de português.

---

## 4. (Opcional) Definir o caminho do Tesseract manualmente

Só faça isso se o teste do passo 3 falhou (Tesseract não encontrado).

**Opção A – Arquivo `.env` na raiz do projeto**

Na pasta **`C:\Users\PC RYZEN\Documents\datacare-app`**, crie ou edite o arquivo **`.env`** e adicione (ajuste o caminho se o seu `tesseract.exe` estiver em outro lugar):

```env
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
```

Quando você usar **`npm run dev`**, o Node carrega esse `.env` e repassa a variável para o serviço de OCR.

**Opção B – Definir no terminal antes de rodar o OCR**

No PowerShell, antes de rodar o serviço de OCR:

```powershell
$env:TESSERACT_CMD="C:\Program Files\Tesseract-OCR\tesseract.exe"
npm run ocr
```

O código do OCR já procura automaticamente em `C:\Program Files\Tesseract-OCR\` e `C:\Program Files (x86)\Tesseract-OCR\`. Só use o passo 4 se o Tesseract estiver em outra pasta.

---

## 5. Subir o serviço de OCR

Na **raiz do projeto** (`C:\Users\PC RYZEN\Documents\datacare-app`):

**Opção A – Tudo junto (Node + Tailwind + OCR):**

```powershell
npm run dev
```

Isso sobe o DataCare e o serviço de OCR (porta 8000 ou 8001 se 8000 estiver em uso). A aplicação já usa a porta certa automaticamente.

**Opção B – Só o OCR em um terminal:**

```powershell
npm run ocr
```

Em **outro** terminal, suba o app:

```powershell
npm run watch:css
npm start
# ou: node server.js
```

O importante é ter **um** processo rodando o OCR (via `npm run dev` ou `npm run ocr`) e **um** rodando o Node (porta 3000).

---

## 6. Testar no navegador

1. Abra o navegador em: **http://localhost:3000**
2. Faça login (se o sistema pedir).
3. Na tela inicial, clique em **Smart**.
4. Arraste uma **foto ou scan da guia** (JPG ou PNG) para a área de upload, ou clique e escolha o arquivo.
5. Aguarde o processamento. O texto da imagem será extraído pelo Tesseract e o parser preencherá os campos da guia.
6. Confira os dados no formulário. Use **“Ver texto lido pela IA”** para ver o texto bruto que o OCR retornou.

**Dicas para melhor resultado:**

- Imagem **nítida** e **bem iluminada**.
- Guia **reta** (evite fotos muito inclinadas); o OpenCV tenta corrigir um pouco o ângulo.
- Preferência por **scan** ou foto de documento em vez de foto de tela de celular com reflexo.

---

## 7. Se nada for extraído (formulário vazio)

- Confirme que o **serviço de OCR** está rodando (terminal com `npm run ocr` ou `npm run dev`).
- Clique em **“Ver texto lido pela IA”**: se o texto bruto estiver vazio, o Tesseract não leu a imagem (qualidade, idioma ou caminho).
- Verifique no terminal do **Python** se aparece alguma mensagem de erro ao processar a imagem.
- Se o Tesseract não for encontrado, confira o passo 4 e o caminho do `tesseract.exe`.

---

## Resumo rápido

| Passo | O que fazer |
|-------|-------------|
| 1 | Saber onde está o `tesseract.exe` (em geral em `C:\Program Files\Tesseract-OCR\`). |
| 2 | Em `services/guia-ocr`: ativar o venv e rodar `pip install -r requirements.txt`. |
| 3 | Testar: `python -c "import pytesseract; print(pytesseract.get_tesseract_version())"` e ver se `por` está em `get_languages()`. |
| 4 | Se der erro, (opcional) definir o caminho do Tesseract (por exemplo em `.env` ou no código). |
| 5 | Na raiz do projeto: `npm run dev` (ou `npm run ocr` + em outro terminal o Node). |
| 6 | Acessar http://localhost:3000 → Smart → enviar uma imagem de guia e conferir o formulário e o “texto lido pela IA”. |

Com o Tesseract e o pacote de português instalados, seguir esses passos é suficiente para usar **apenas análise real** da guia, sem dados mockados.
