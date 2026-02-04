/**
 * GuiaService - Orquestra chamada ao microserviço de OCR e validação de negócio.
 * Regras: enviar imagem ao Python quando disponível; se OCR indisponível, retorna
 * formulário vazio com needs_manual_review para preenchimento manual (evita 503).
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const CONFIDENCE_THRESHOLD = 0.85;
const ARQUIVO_PORTA_OCR = path.join(process.cwd(), '.guia-ocr-port');

/**
 * URL do microserviço de OCR. Ordem: 1) GUIA_OCR_URL no .env; 2) porta em .guia-ocr-port (gravada pelo start-ocr.js); 3) 8000.
 */
function getGuiaOcrUrl() {
  if (process.env.GUIA_OCR_URL) return process.env.GUIA_OCR_URL;
  try {
    if (fs.existsSync(ARQUIVO_PORTA_OCR)) {
      const porta = fs.readFileSync(ARQUIVO_PORTA_OCR, 'utf8').trim();
      if (/^\d+$/.test(porta)) return `http://localhost:${porta}`;
    }
  } catch (e) {
    // ignora
  }
  return 'http://localhost:8000';
}

/** URL da API ANS para consulta de operadora por Registro ANS (dados abertos). */
const ANS_OPERADORAS_URL = 'https://www.ans.gov.br/operadoras-entity/v1/operadoras';

/**
 * Busca o nome do convênio (razão social) na ANS pelo Registro ANS.
 * @param {string} registroAns - Código do Registro ANS (ex: 005622)
 * @returns {Promise<string|null>} Razão social da operadora ou null
 */
async function fetchNomeOperadoraANS(registroAns) {
  if (!registroAns || typeof registroAns !== 'string') return null;
  const cod = registroAns.replace(/\D/g, '').padStart(6, '0').slice(0, 6);
  if (!cod) return null;
  try {
    const { data } = await axios.get(`${ANS_OPERADORAS_URL}/${cod}`, { timeout: 8000 });
    return (data && (data.razao_social || data.nome_fantasia)) ? String(data.razao_social || data.nome_fantasia).trim() : null;
  } catch (err) {
    if (err.response && err.response.status === 404) return null;
    return null;
  }
}

/**
 * Códigos de operadora válidos (ANS). Em produção, buscar do banco (tabela operadoras/convenios).
 */
function getOperadorasValidas() {
  const envList = process.env.OPERADORAS_VALIDAS;
  if (envList) return new Set(envList.split(',').map((s) => s.trim()));
  return new Set(['005622', '12345', '34123', '99999']); // 005622 = Sul América (ANS)
}

/**
 * CNES permitidos (ex.: Hospital Anis Rassi). Em produção, buscar do banco.
 * .env: CNES_VALIDOS=3546551,1234567
 */
function getCnesValidos() {
  const envList = process.env.CNES_VALIDOS;
  if (envList) return new Set(envList.split(',').map((s) => s.trim().replace(/\D/g, '')));
  return null; // null = não validar CNES (qualquer um aceito)
}

/** Tolerância em reais para soma 59+60+61+63 = 65 (arredondamento). */
const TOLERANCIA_TOTAL_GERAL = 0.02;

/**
 * Converte DD/MM/AAAA para ISO 8601 (AAAA-MM-DD). Retorna null se inválido.
 */
function dataParaIso(str) {
  if (!str || typeof str !== 'string') return null;
  const t = str.trim();
  const m = t.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    let y = m[3];
    if (y.length === 2) y = parseInt(y, 10) < 50 ? '20' + y : '19' + y;
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  if (/^\d{8}$/.test(t.replace(/\D/g, ''))) {
    const n = t.replace(/\D/g, '');
    return `${n.slice(4, 8)}-${n.slice(2, 4)}-${n.slice(0, 2)}`;
  }
  return null;
}

/**
 * Sanity Check TISS: CNES, soma dos totais (59+60+61+63 = 65), datas ISO, números e strings saneados.
 * @param {Object} d - DTO (dados extraídos)
 * @returns {Object} { erros: [], dados: d com campos iso e numéricos normalizados }
 */
function sanityCheck(d) {
  const erros = [];
  const dados = { ...d };

  // CNES: se CNES_VALIDOS estiver definido, validar
  const cnesValidos = getCnesValidos();
  if (cnesValidos) {
    const cnes = (dados.codigo_cnes || '').toString().replace(/\D/g, '');
    if (cnes && !cnesValidos.has(cnes)) {
      erros.push({ campo: 'codigo_cnes', mensagem: 'CNES não pertence à rede cadastrada (ex.: Anis Rassi).' });
    }
  }

  // Validação matemática: soma 59 + 60 + 61 + 63 = 65 (Total Geral). Se não bater, erro "Inconsistência Financeira".
  const v59 = Number(dados.total_procedimentos) || 0;
  const v60 = Number(dados.total_taxas) || 0;
  const v61 = Number(dados.total_materiais) || 0;
  const v63 = Number(dados.total_medicamentos) || 0;
  const v65 = Number(dados.total_geral) || 0;
  const soma = v59 + v60 + v61 + v63;
  if (v65 > 0 && Math.abs(soma - v65) > TOLERANCIA_TOTAL_GERAL) {
    erros.push({
      campo: 'total_geral',
      codigo: 'INCONSISTENCIA_FINANCEIRA',
      mensagem: 'Inconsistência Financeira',
      detalhe: `Soma (59+60+61+63) = R$ ${soma.toFixed(2)} ≠ Total Geral (65) = R$ ${v65.toFixed(2)}.`,
    });
  }

  // Datas em ISO 8601 (campos _iso para banco/API)
  const camposData = ['data_autorizacao', 'data_validade_senha', 'data_validade', 'data_nascimento', 'data_solicitacao'];
  camposData.forEach((campo) => {
    const iso = dataParaIso(dados[campo]);
    if (iso) dados[`${campo}_iso`] = iso;
  });

  // Garantir números como Number
  dados.total_procedimentos = v59;
  dados.total_taxas = v60;
  dados.total_materiais = v61;
  dados.total_medicamentos = v63;
  dados.total_geral = v65;

  // Strings sensíveis: trim e sem espaços (Senha, Nº Guia)
  if (typeof dados.senha === 'string') dados.senha = dados.senha.trim().replace(/\s/g, '');
  if (typeof dados.numero_guia_principal === 'string') dados.numero_guia_principal = dados.numero_guia_principal.trim().replace(/\s/g, '');

  // Schema-like: trim em todos os campos string do DTO (evita espaços que quebram validação)
  const stringKeys = [
    'tipo_guia', 'versao_tiss', 'codigo_operadora', 'numero_guia_prestador', 'numero_guia_principal',
    'data_autorizacao', 'data_validade_senha', 'numero_guia_atribuido_operadora', 'numero_carteirinha',
    'data_validade', 'nome_paciente', 'data_nascimento', 'atendimento_rn', 'codigo_operadora_solicitante',
    'nome_contratado', 'nome_profissional_solicitante', 'conselho_profissional', 'numero_conselho',
    'uf_conselho', 'codigo_cbo', 'carater_atendimento', 'data_solicitacao', 'indicacao_clinica',
    'codigo_operadora_executante', 'nome_contratado_executante', 'codigo_cnes', 'tipo_atendimento',
    'observacao_justificativa', 'status_guia', 'nome_operadora'
  ];
  stringKeys.forEach((k) => {
    if (dados[k] != null && typeof dados[k] === 'string') dados[k] = dados[k].trim();
  });
  if (Array.isArray(dados.lista_procedimentos)) {
    dados.lista_procedimentos = dados.lista_procedimentos.map((p) => ({
      ...p,
      tabela: (p.tabela != null ? String(p.tabela) : '').trim() || undefined,
      codigo_tuss: (p.codigo_tuss != null ? String(p.codigo_tuss) : '').trim(),
      descricao: (p.descricao != null ? String(p.descricao) : '').trim(),
      qtde_solic: (p.qtde_solic != null ? String(p.qtde_solic) : '').trim() || undefined,
      qtde_aut: (p.qtde_aut != null ? String(p.qtde_aut) : '').trim() || undefined,
      valor: p.valor != null ? Number(p.valor) : null,
    }));
  }

  return { erros, dados };
}

/**
 * Resposta simulada quando o serviço de OCR está indisponível.
 * Permite que o usuário preencha o formulário manualmente (zero 503).
 */
function resultadoFallback(mensagemServicoIndisponivel) {
  const erros = mensagemServicoIndisponivel
    ? [{ campo: 'ocr', mensagem: mensagemServicoIndisponivel }]
    : [];
  return {
    tipo_guia: '',
    versao_tiss: '',
    nome_paciente: '',
    numero_carteirinha: '',
    codigo_operadora: '',
    numero_guia_prestador: '',
    nome_operadora: '',
    data_validade: '',
    data_nascimento: '',
    senha: '',
    numero_guia_principal: '',
    data_autorizacao: '',
    data_validade_senha: '',
    numero_guia_atribuido_operadora: '',
    atendimento_rn: '',
    codigo_operadora_solicitante: '',
    nome_contratado: '',
    nome_profissional_solicitante: '',
    conselho_profissional: '',
    numero_conselho: '',
    uf_conselho: '',
    codigo_cbo: '',
    carater_atendimento: '',
    data_solicitacao: '',
    indicacao_clinica: '',
    tipo_atendimento: '',
    observacao_justificativa: '',
    lista_procedimentos: [],
    status_guia: '',
    total_procedimentos: null,
    total_taxas: null,
    total_materiais: null,
    total_medicamentos: null,
    total_geral: null,
    confidence_score: 0,
    needs_manual_review: true,
    erros,
    raw_text: '',
  };
}

/**
 * Chama o microserviço Python de OCR. Em falha (ECONNREFUSED, timeout, etc.) retorna null.
 * @param {string} filePath - Caminho absoluto do arquivo de imagem
 * @param {string} originalName - Nome original do arquivo
 * @returns {Promise<Object|null>} Resposta do OCR ou null se serviço indisponível
 */
async function callOcrService(filePath, originalName) {
  const baseUrl = getGuiaOcrUrl();
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), { filename: originalName || 'guia.jpg' });
    const response = await axios.post(`${baseUrl}/ocr/guia`, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 60000,
    });
    return response.data;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
      return null;
    }
    throw err;
  }
}

/**
 * Valida regras de negócio, Sanity Check TISS e monta o DTO do atendimento pré-criado.
 * Inclui: operadora válida, CNES (se configurado), soma 59+60+61+63=65, datas ISO, números/strings saneados.
 * @param {Object} ocrResult - Resultado do OCR (nome_paciente, codigo_operadora, etc.)
 * @returns {Object} { dados, needs_manual_review, erros }
 */
function validateAndBuildDto(ocrResult) {
  const erros = [];
  const operadorasValidas = getOperadorasValidas();
  const codigoOperadora = ocrResult.codigo_operadora || '';
  const codigoExiste = !codigoOperadora || operadorasValidas.has(String(codigoOperadora).trim());
  if (codigoOperadora && !codigoExiste) {
    erros.push({ campo: 'codigo_operadora', mensagem: 'Convênio não cadastrado no sistema.' });
  }
  const confidence = Number(ocrResult.confidence_score) || 0;

  const lista_procedimentos = Array.isArray(ocrResult.lista_procedimentos)
    ? ocrResult.lista_procedimentos
    : [];
  let dados = {
    ...ocrResult,
    tipo_guia: ocrResult.tipo_guia || '',
    versao_tiss: ocrResult.versao_tiss || '',
    nome_paciente: ocrResult.nome_paciente ?? '',
    numero_carteirinha: ocrResult.numero_carteirinha || '',
    codigo_operadora: ocrResult.codigo_operadora || '',
    numero_guia_prestador: ocrResult.numero_guia_prestador || '',
    nome_operadora: ocrResult.nome_operadora || '',
    data_validade: ocrResult.data_validade || '',
    data_nascimento: ocrResult.data_nascimento || '',
    senha: ocrResult.senha || '',
    lista_procedimentos,
    confidence_score: confidence,
    raw_text: ocrResult.raw_text || '',
  };

  const { erros: sanityErros, dados: dadosSaneados } = sanityCheck(dados);
  erros.push(...sanityErros);
  dados = { ...dados, ...dadosSaneados };

  const needs_manual_review = confidence < CONFIDENCE_THRESHOLD || erros.length > 0;
  dados.needs_manual_review = needs_manual_review;
  dados.erros = erros;

  return { dados, needs_manual_review, erros };
}

/**
 * Fluxo principal: tenta OCR no Python; se indisponível, retorna DTO vazio para preenchimento manual.
 * @param {string} filePath - Caminho do arquivo enviado (multer)
 * @param {string} originalName - Nome original do arquivo
 * @returns {Promise<Object>} DTO para o frontend (sempre sucesso; needs_manual_review quando fallback)
 */
async function processarUploadGuia(filePath, originalName) {
  const ocrResult = await callOcrService(filePath, originalName);

  if (!ocrResult) {
    return resultadoFallback(
      'Leitura automática temporariamente indisponível. Preencha os dados abaixo e confira antes de confirmar. (Serviço OCR em ' + getGuiaOcrUrl() + ')'
    );
  }

  const { dados, needs_manual_review, erros } = validateAndBuildDto(ocrResult);

  if (dados.codigo_operadora) {
    const nomeOperadora = await fetchNomeOperadoraANS(dados.codigo_operadora);
    if (nomeOperadora) dados.nome_operadora = nomeOperadora;
  }

  return {
    ...dados,
    needs_manual_review,
    erros,
    raw_text: dados.raw_text || '',
  };
}

module.exports = {
  processarUploadGuia,
  validateAndBuildDto,
  callOcrService,
  resultadoFallback,
  CONFIDENCE_THRESHOLD,
};
