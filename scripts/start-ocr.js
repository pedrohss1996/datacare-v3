/**
 * Sobe o microserviço de OCR (Python/FastAPI).
 * Se a porta 8000 estiver em uso, usa 8001 automaticamente e avisa para definir GUIA_OCR_URL.
 * Uso: node scripts/start-ocr.js (ou npm run ocr).
 */

const net = require('net');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Carrega .env da raiz para repassar GEMINI_API_KEY ao serviço de OCR
try {
  const dotenv = require('dotenv');
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
} catch (e) { /* dotenv opcional */ }

const PORTA_PADRAO = 8000;
const PORTA_ALTERNATIVA = 8001;

function portaEmUso(porta) {
  return new Promise((resolve) => {
    const s = net.createConnection(porta, '127.0.0.1', () => {
      s.destroy();
      resolve(true);
    });
    s.on('error', () => resolve(false));
    s.setTimeout(200, () => {
      s.destroy();
      resolve(false);
    });
  });
}

const ARQUIVO_PORTA = path.join(__dirname, '..', '.guia-ocr-port');

async function escolherPorta() {
  const forcar = process.env.GUIA_OCR_PORT;
  if (forcar) return parseInt(forcar, 10);
  if (await portaEmUso(PORTA_PADRAO)) {
    console.warn('[OCR] Porta ' + PORTA_PADRAO + ' em uso. Usando ' + PORTA_ALTERNATIVA + '. A aplicação (localhost:3000) usa essa porta automaticamente.');
    return PORTA_ALTERNATIVA;
  }
  return PORTA_PADRAO;
}

function gravarPortaParaApp(porta) {
  try {
    fs.writeFileSync(ARQUIVO_PORTA, String(porta), 'utf8');
  } catch (e) {
    console.warn('[OCR] Não foi possível gravar .guia-ocr-port:', e.message);
  }
}

(async () => {
  const porta = await escolherPorta();
  gravarPortaParaApp(porta);
  const raiz = path.join(__dirname, '..');
  const ocrDir = path.join(raiz, 'services', 'guia-ocr');
  const isWin = process.platform === 'win32';
  const venvPython = path.join(ocrDir, '.venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');

  let comando = venvPython;
  let args = ['-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', String(porta)];

  if (!fs.existsSync(venvPython)) {
    comando = isWin ? 'python' : 'python3';
    console.warn('[OCR] Venv não encontrado em services/guia-ocr/.venv. Usando: ' + comando);
    console.warn('[OCR] Criar venv: cd services/guia-ocr && py -3.11 -m venv .venv && .venv\\Scripts\\pip install -r requirements.txt');
  }

  const filho = spawn(comando, args, {
    cwd: ocrDir,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });

  filho.on('error', (err) => {
    console.error('[OCR] Erro ao iniciar serviço:', err.message);
    process.exit(1);
  });

  filho.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.warn('[OCR] Porta em uso? Use: set GUIA_OCR_PORT=8001 && npm run ocr (a aplicação lê a porta automaticamente).');
      process.exit(code || 1);
    }
    if (signal) process.exit(1);
  });
})();
