"""
DataCare - Extração TISS via Gemini Vision.
Envia a imagem (pré-processada) diretamente ao Gemini e recebe JSON com todos os campos da tabela TISS.
Usa REST API para compatibilidade (imagem em base64).
"""
import base64
import json
import logging
import os
import re
import urllib.request
import urllib.error
from typing import Optional, Any, Dict, List

from schemas import GuiaOCROutput, ProcedimentoItem

logger = logging.getLogger(__name__)

GEMINI_AVAILABLE = bool(os.environ.get("GEMINI_API_KEY"))

# Prompt estruturado: extração por regiões (Layout TISS) para máxima precisão
PROMPT_TISS = """Você é um especialista em guias TISS (Padrão ANS) do Brasil. Analise esta imagem de guia de convênio e extraia TODOS os dados visíveis.

METODOLOGIA OBRIGATÓRIA – Siga esta ordem para não trocar campos:
1. CABEÇALHO: Identifique o tipo (SP_SADT, HONORARIO, INTERNACAO, CONSULTA, ODONTO) e a versão (3.0, 3.1, 4.0, 4.1, 4.2). Depois extraia, um a um:
   - 1 Registro ANS → codigo_operadora (somente números, ex: 005622)
   - 2 Nº Guia no Prestador → numero_guia_prestador (não confundir com campo 3)
   - 3 N° Guia Principal → numero_guia_principal
   - 4 Data da Autorização → data_autorizacao (formato DD/MM/AAAA)
   - 5 Senha → senha (o número ao lado do rótulo "5 - Senha")
   - 6 Data Validade da Senha → data_validade_senha (DD/MM/AAAA; não é o mesmo que campo 5)
   - 7 Número da Guia Atribuído pela Operadora → numero_guia_atribuido_operadora

2. BENEFICIÁRIO:
   - 8 Número da Carteirinha → numero_carteirinha (número longo, sem pontos ou traços no valor)
   - 9 Validade da Carteira → data_validade (DD/MM/AAAA)
   - 10 Nome do beneficiário → nome_paciente (nome completo)
   - 11 Data de Nascimento ou CNS → data_nascimento (DD/MM/AAAA ou número CNS)
   - 12 Atendimento a RN → atendimento_rn (S ou N)

3. SOLICITANTE:
   - 13 Código na Operadora → codigo_operadora_solicitante
   - 14 Nome do Contratado → nome_contratado (nome do hospital/clínica)
   - 15 Nome do Profissional Solicitante → nome_profissional_solicitante (médico)
   - 16 Conselho Profissional → conselho_profissional (ex: CRM)
   - 17 Número no Conselho → numero_conselho
   - 18 UF → uf_conselho (sigla do estado, ex: GO, SP)
   - 19 Código CBO → codigo_cbo (numérico)

4. SOLICITAÇÃO:
   - 21 Caráter do Atendimento → carater_atendimento (número ou texto)
   - 22 Data da Solicitação → data_solicitacao (DD/MM/AAAA)
   - 23 Indicação Clínica → indicacao_clinica (texto completo)

5. PROCEDIMENTOS: Para CADA linha da tabela de procedimentos (24-28), extraia:
   - 24 Tabela (se houver), 25 Código do procedimento (8 dígitos TUSS), 26 Descrição, 27 Qtde solicitada, 28 Qtde autorizada, e valor em R$ se visível.
   Inclua em lista_procedimentos: { "codigo_tuss": "8 dígitos", "descricao": "texto", "tabela": "opcional", "qtde_solic": "opcional", "qtde_aut": "opcional", "valor": número }

6. EXECUTANTE:
   - 29 Código na Operadora (executante) → codigo_operadora_executante
   - 30 Nome do Contratado (executante) → nome_contratado_executante
   - 31 Código CNES → codigo_cnes
   - 32 Tipo de Atendimento → tipo_atendimento

7. OBSERVAÇÃO E TOTAIS:
   - 58 Observação / Justificativa → observacao_justificativa (texto completo)
   - 59 Total Procedimentos (R$) → total_procedimentos (número, ex: 127.72)
   - 60 Total Taxas e Aluguéis (R$) → total_taxas
   - 61 Total Materiais (R$) → total_materiais
   - 63 Total Medicamentos (R$) → total_medicamentos
   - 65 Total Geral (R$) → total_geral

REGRAS CRÍTICAS:
- Cada valor deve vir do campo correto: o que está ao lado do rótulo "5 - Senha" é senha; ao lado de "6 - Data Validade da Senha" é data_validade_senha.
- Datas: SEMPRE DD/MM/AAAA (ex: 12/01/2026). Nada de AAAA-MM-DD.
- Valores monetários: número com ponto decimal (ex: 352.77). Nunca vírgula nem "R$" no número.
- Códigos TUSS: exatamente 8 dígitos; preencha com zeros à esquerda se vier com menos (ex: 41001010).
- Use null apenas quando o campo realmente não existir na guia ou estiver ilegível. Se o campo existir, preencha.
- status_guia: "autorizada" se houver autorização/senha preenchida; "pendente" ou "cancelada" se indicado.

Retorne UM ÚNICO objeto JSON válido, sem markdown, sem texto antes ou depois. Estrutura (respeite os nomes das chaves):

{"tipo_guia":"SP_SADT|HONORARIO|INTERNACAO|CONSULTA|ODONTO|OUTROS","versao_tiss":"3.0|4.0|...|null","codigo_operadora":"...","numero_guia_prestador":"...","numero_guia_principal":"...","data_autorizacao":"DD/MM/AAAA","senha":"...","data_validade_senha":"DD/MM/AAAA","numero_guia_atribuido_operadora":"...","numero_carteirinha":"...","data_validade":"DD/MM/AAAA","nome_paciente":"...","data_nascimento":"DD/MM/AAAA","atendimento_rn":"S|N","codigo_operadora_solicitante":"...","nome_contratado":"...","nome_profissional_solicitante":"...","conselho_profissional":"...","numero_conselho":"...","uf_conselho":"...","codigo_cbo":"...","carater_atendimento":"...","data_solicitacao":"DD/MM/AAAA","indicacao_clinica":"...","lista_procedimentos":[{"codigo_tuss":"xxxxxxxx","descricao":"...","valor":0.0}],"codigo_operadora_executante":"...","nome_contratado_executante":"...","codigo_cnes":"...","tipo_atendimento":"...","observacao_justificativa":"...","status_guia":"autorizada|pendente|cancelada","total_procedimentos":0.0,"total_taxas":0.0,"total_materiais":0.0,"total_medicamentos":0.0,"total_geral":0.0}

Responda SOMENTE com o JSON."""

# Prompt curto – mesmo estilo do chat onde a extração funcionou
PROMPT_TISS_SHORT = """Extraia todos os dados visíveis desta guia de convênio TISS (padrão ANS Brasil). Retorne UM ÚNICO JSON válido, sem markdown e sem texto antes ou depois.

Use exatamente estas chaves (null se não existir): tipo_guia, versao_tiss, codigo_operadora, numero_guia_prestador, numero_guia_principal, data_autorizacao, senha, data_validade_senha, numero_guia_atribuido_operadora, numero_carteirinha, data_validade, nome_paciente, data_nascimento, atendimento_rn, codigo_operadora_solicitante, nome_contratado, nome_profissional_solicitante, conselho_profissional, numero_conselho, uf_conselho, codigo_cbo, carater_atendimento, data_solicitacao, indicacao_clinica, lista_procedimentos (array de {codigo_tuss, descricao, valor}), codigo_operadora_executante, nome_contratado_executante, codigo_cnes, tipo_atendimento, observacao_justificativa, status_guia, total_procedimentos, total_taxas, total_materiais, total_medicamentos, total_geral.

Regras: datas DD/MM/AAAA; valores em número (ex: 352.77); códigos TUSS 8 dígitos. Resposta SOMENTE o JSON."""

# Prompt especialista faturamento TISS – JSON puro, datas YYYY-MM-DD, valores float, campos 24-28 separados por linha
PROMPT_TISS_FATURAMENTO = """Atue como um especialista em faturamento hospitalar TISS.
Sua tarefa é extrair TODOS os dados da guia SP/SADT anexa.

REGRAS CRÍTICAS:
1. Retorne APENAS um JSON puro (sem markdown, sem texto antes ou depois).
2. Se um campo estiver ilegível ou ausente, retorne null.
3. Remova formatação de moeda (R$) e retorne todos os valores monetários como float (ex: 352.77).
4. Normalize TODAS as datas para o padrão YYYY-MM-DD (ex: 2026-01-12).

CAMPOS 8 E 10 – OBRIGATÓRIOS (use EXATAMENTE estes nomes de chave no JSON):
- Campo 8 – Número da Carteirinha: no JSON use a chave "numero_carteirinha" (string com o número longo; procure na guia o rótulo "8" ou "Número da Carteira" ou "Número da Carteirinha").
- Campo 10 – Nome do beneficiário: no JSON use a chave "nome_paciente" (string com o nome completo; procure na guia o rótulo "10" ou "Nome" no bloco Beneficiário).
O JSON DEVE conter as chaves "numero_carteirinha" e "nome_paciente" no primeiro nível do objeto. Não coloque esses dados dentro de um objeto aninhado; coloque no mesmo nível que codigo_operadora e data_autorizacao.

CAMPOS 24 A 28 – UM OBJETO POR LINHA DA TABELA:
Uma guia pode ter VÁRIOS procedimentos. A tabela de procedimentos tem várias linhas. Cada LINHA da tabela é um item diferente.
- NÃO agrupe as linhas em um só objeto. Extraia CADA linha como um elemento separado no array lista_procedimentos.
- Por linha (campos 24 a 28), extraia: 24 Tabela → tabela, 25 Código TUSS → codigo_tuss (8 dígitos), 26 Descrição → descricao, 27 Qtde solicitada → qtde_solic, 28 Qtde autorizada → qtde_aut, e valor em R$ (float) se visível → valor.
- O campo 29 (Código na Operadora do executante) NÃO faz parte de cada linha: é um único valor da guia → codigo_operadora_executante (fora do array).

Estrutura de lista_procedimentos: array de objetos, cada um com: tabela, codigo_tuss, descricao, qtde_solic, qtde_aut, valor. Um objeto para cada linha da tabela de procedimentos.

Extraia TODOS estes campos (nomes exatos no primeiro nível do JSON; null se não existir):
tipo_guia, versao_tiss, codigo_operadora, numero_guia_prestador, numero_guia_principal, data_autorizacao, senha, data_validade_senha, numero_guia_atribuido_operadora, numero_carteirinha, data_validade, nome_paciente, data_nascimento, atendimento_rn, codigo_operadora_solicitante, nome_contratado, nome_profissional_solicitante, conselho_profissional, numero_conselho, uf_conselho, codigo_cbo, carater_atendimento, data_solicitacao, indicacao_clinica, lista_procedimentos (array: um item por linha, cada item com tabela, codigo_tuss, descricao, qtde_solic, qtde_aut, valor), codigo_operadora_executante, nome_contratado_executante, codigo_cnes, tipo_atendimento, observacao_justificativa, status_guia, total_procedimentos, total_taxas, total_materiais, total_medicamentos, total_geral.

Exemplo de início do JSON (obrigatório ter numero_carteirinha e nome_paciente assim):
{"tipo_guia":"SP_SADT","versao_tiss":"3.0","codigo_operadora":"005622","numero_carteirinha":"55788888492998820019","nome_paciente":"Fulano de Souza Silva", ...}

Resposta: SOMENTE o JSON."""


def _parse_json_from_response(text: str) -> Optional[Dict[str, Any]]:
    if not text or not text.strip():
        return None
    text = text.strip()
    # Remove BOM e espaços
    if text.startswith("\ufeff"):
        text = text[1:]
    # Bloco markdown
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if m:
        text = m.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        chunk = text[start : end + 1]
        try:
            return json.loads(chunk)
        except json.JSONDecodeError as e:
            logger.info("JSON parse error: %s. Primeiros 400 chars: %s", e.msg, chunk[:400])
        for attempt in (chunk, re.sub(r",\s*([}\]])", r"\1", chunk)):
            try:
                return json.loads(attempt)
            except json.JSONDecodeError:
                pass
    logger.warning("Resposta do Gemini sem JSON válido. Início: %s", (text[:500] if text else ""))
    return None


def _safe_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        s = str(v).strip().replace(",", ".")
        return float(re.sub(r"[^\d.\-]", "", s)) if s else None
    except (ValueError, TypeError):
        return None


# Normalização pós-resposta para máxima confiabilidade
_DATE_RE = re.compile(r"(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2,4})")


def _normalize_date(s: Optional[str]) -> Optional[str]:
    """Normaliza data: aceita YYYY-MM-DD (do prompt faturamento) ou DD/MM/AAAA; retorna como está ou DD/MM/AAAA."""
    if not s or not isinstance(s, str):
        return None
    s = s.strip()
    if not s:
        return None
    # Gemini faturamento retorna YYYY-MM-DD; aceitar e manter
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    m = _DATE_RE.search(s)
    if m:
        d, mo, y = m.group(1), m.group(2), m.group(3)
        if len(y) == 2:
            y = "20" + y if int(y) < 50 else "19" + y
        return f"{int(d):02d}/{int(mo):02d}/{y}"
    if re.match(r"^\d{8}$", re.sub(r"\D", "", s)):
        n = re.sub(r"\D", "", s)
        return f"{n[0:2]}/{n[2:4]}/{n[4:8]}"
    return s.strip()[:10] if s else None


def _normalize_tuss(s: Optional[str]) -> Optional[str]:
    """Código TUSS: só dígitos, 8 caracteres (zeros à esquerda)."""
    if not s:
        return None
    digits = re.sub(r"\D", "", str(s).strip())
    if not digits:
        return None
    return digits.zfill(8)[:8]


def _normalize_codigo_operadora(s: Optional[str]) -> Optional[str]:
    """Código operadora/ANS: só dígitos, até 10 caracteres."""
    if not s:
        return None
    digits = re.sub(r"\D", "", str(s).strip())
    return digits[:10] if digits else None


def _normalize_string(s: Optional[str], max_len: int = 500) -> Optional[str]:
    """Trim e limita tamanho; None se vazio."""
    if s is None:
        return None
    t = str(s).strip()
    if not t:
        return None
    return t[:max_len] if max_len else t


def _dict_to_guia_output(data: Dict[str, Any]) -> GuiaOCROutput:
    def get(key: str) -> Optional[str]:
        v = data.get(key)
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return str(v).strip() if v else None

    procedimentos: List[ProcedimentoItem] = []
    for p in (data.get("lista_procedimentos") or data.get("faturamento", {}).get("itens") or [])[:50]:
        if isinstance(p, dict):
            cod_raw = (p.get("codigo_tuss") or p.get("codigo") or "").strip()
            cod = _normalize_tuss(cod_raw) if cod_raw else None
            desc = _normalize_string(p.get("descricao") or p.get("desc"), 200) or "-"
            tabela = _normalize_string(str(p.get("tabela", "")).strip() if p.get("tabela") is not None else None, 20)
            qtde_solic = _normalize_string(str(p.get("qtde_solic", "")).strip() if p.get("qtde_solic") is not None else None, 10)
            qtde_aut = _normalize_string(str(p.get("qtde_aut", "")).strip() if p.get("qtde_aut") is not None else None, 10)
            val = _safe_float(p.get("valor"))
            if cod:
                procedimentos.append(
                    ProcedimentoItem(
                        tabela=tabela,
                        codigo_tuss=cod,
                        descricao=desc,
                        qtde_solic=qtde_solic,
                        qtde_aut=qtde_aut,
                        valor=val,
                    )
                )

    fat = data.get("faturamento") or {}
    totais = fat.get("totais", {}) if isinstance(fat, dict) else {}
    if isinstance(totais, dict):
        total_proc = _safe_float(totais.get("procedimentos") or data.get("total_procedimentos"))
        total_tax = _safe_float(totais.get("taxas") or data.get("total_taxas"))
        total_mat = _safe_float(totais.get("materiais") or data.get("total_materiais"))
        total_med = _safe_float(totais.get("medicamentos") or data.get("total_medicamentos"))
        total_geral = _safe_float(totais.get("geral") or data.get("total_geral"))
    else:
        total_proc = _safe_float(data.get("total_procedimentos"))
        total_tax = _safe_float(data.get("total_taxas"))
        total_mat = _safe_float(data.get("total_materiais"))
        total_med = _safe_float(data.get("total_medicamentos"))
        total_geral = _safe_float(data.get("total_geral"))

    # Campos 8 (carteirinha) e 10 (nome): várias chaves possíveis conforme resposta do modelo
    def _get_beneficiario() -> Dict[str, Any]:
        b = data.get("beneficiario") or data.get("paciente")
        return b if isinstance(b, dict) else {}

    benef = _get_beneficiario()
    n = _normalize_string(
        get("nome_paciente")
        or benef.get("nome") or benef.get("nome_paciente")
        or data.get("nome_beneficiario") or data.get("beneficiario_nome")
        or data.get("nome")
        or (data.get("10") if isinstance(data.get("10"), str) else None),  # fallback chave "10"
        200,
    )
    c = _normalize_string(
        get("numero_carteirinha")
        or benef.get("carteira") or benef.get("numero_carteirinha") or benef.get("carteirinha")
        or data.get("carteirinha") or data.get("numero_carteira") or data.get("carteira")
        or (data.get("8") if isinstance(data.get("8"), str) else None),  # fallback chave "8"
        50,
    )
    if not n or not c:
        logger.info(
            "Campos 8/10 ausentes na resposta. Chaves do JSON: %s. nome_paciente=%s, numero_carteirinha=%s",
            list(data.keys()),
            data.get("nome_paciente"),
            data.get("numero_carteirinha"),
        )
    guia_num = get("numero_guia_principal") or get("guia") or get("numero_guia_prestador")
    # Confiança proporcional aos campos críticos preenchidos
    campos_ok = sum([
        bool(_normalize_codigo_operadora(get("codigo_operadora"))),
        bool(n),
        bool(c),
        bool(guia_num or get("numero_guia_principal")),
        bool(get("data_autorizacao") or get("data_solicitacao")),
        bool(procedimentos),
    ])
    confidence = min(1.0, 0.5 + 0.08 * campos_ok)

    return GuiaOCROutput(
        tipo_guia=_normalize_string(get("tipo_guia"), 30),
        versao_tiss=_normalize_string(get("versao_tiss"), 10),
        codigo_operadora=_normalize_codigo_operadora(get("codigo_operadora")),
        numero_guia_prestador=_normalize_string(get("numero_guia_prestador"), 30),
        numero_guia_principal=_normalize_string(get("numero_guia_principal") or guia_num, 30),
        data_autorizacao=_normalize_date(get("data_autorizacao")),
        senha=_normalize_string(get("senha"), 30),
        data_validade_senha=_normalize_date(get("data_validade_senha")),
        numero_guia_atribuido_operadora=_normalize_string(get("numero_guia_atribuido_operadora"), 30),
        numero_carteirinha=c,
        data_validade=_normalize_date(get("data_validade")),
        nome_paciente=n,
        data_nascimento=_normalize_date(get("data_nascimento")) or _normalize_string(get("data_nascimento"), 20),
        atendimento_rn=_normalize_string(get("atendimento_rn"), 1) if get("atendimento_rn") else None,
        codigo_operadora_solicitante=_normalize_string(get("codigo_operadora_solicitante"), 20),
        nome_contratado=_normalize_string(get("nome_contratado"), 200),
        nome_profissional_solicitante=_normalize_string(get("nome_profissional_solicitante"), 200),
        conselho_profissional=_normalize_string(get("conselho_profissional"), 20),
        numero_conselho=_normalize_string(get("numero_conselho"), 20),
        uf_conselho=_normalize_string(get("uf_conselho"), 2),
        codigo_cbo=_normalize_string(get("codigo_cbo"), 20),
        carater_atendimento=_normalize_string(get("carater_atendimento"), 20),
        data_solicitacao=_normalize_date(get("data_solicitacao")),
        indicacao_clinica=_normalize_string(get("indicacao_clinica"), 500),
        lista_procedimentos=procedimentos,
        codigo_operadora_executante=_normalize_string(get("codigo_operadora_executante"), 20),
        nome_contratado_executante=_normalize_string(get("nome_contratado_executante"), 200),
        codigo_cnes=_normalize_string(get("codigo_cnes"), 20),
        tipo_atendimento=_normalize_string(get("tipo_atendimento"), 20),
        observacao_justificativa=_normalize_string(get("observacao_justificativa"), 500),
        status_guia=_normalize_string(get("status_guia"), 20),
        total_procedimentos=total_proc,
        total_taxas=total_tax,
        total_materiais=total_mat,
        total_medicamentos=total_med,
        total_geral=total_geral,
        nome_operadora=None,
        confidence_score=round(confidence, 2),
        raw_text=None,
    )


def extract_guia_from_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> Optional[GuiaOCROutput]:
    """
    Envia a imagem ao Gemini Vision e retorna GuiaOCROutput com todos os campos TISS.
    Usa REST API (imagem em base64). Retorna None se falhar ou GEMINI_API_KEY não estiver definida.
    """
    if not GEMINI_AVAILABLE or not image_bytes:
        return None

    api_key = os.environ.get("GEMINI_API_KEY")
    # Modelo com suporte a imagem: gemini-2.5-flash ou gemini-2.0-flash (gemini-1.5-flash retorna 404 na v1beta)
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    b64 = base64.standard_b64encode(image_bytes).decode("ascii")
    # Prompt: faturamento (padrão) = especialista TISS, JSON puro, datas YYYY-MM-DD, float para valores
    prompt_mode = os.environ.get("GEMINI_PROMPT", "faturamento").strip().lower()
    if prompt_mode in ("short", "1"):
        prompt = PROMPT_TISS_SHORT
    elif prompt_mode == "full":
        prompt = PROMPT_TISS
    else:
        prompt = PROMPT_TISS_FATURAMENTO
    payload = {
        "contents": [
            {
                "parts": [
                    {"inline_data": {"mime_type": mime_type, "data": b64}},
                    {"text": prompt},
                ]
            }
        ],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 16384, "topP": 0.95},
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        logger.warning("Gemini API HTTP error: %s %s", e.code, e.read().decode()[:200])
        return None
    except Exception as e:
        logger.exception("Gemini Vision falhou: %s", e)
        return None

    text = None
    for c in (body.get("candidates") or []):
        for p in (c.get("content", {}).get("parts") or []):
            if "text" in p:
                text = p["text"]
                break
        if text:
            break

    if not text:
        logger.warning("Gemini retornou sem texto.")
        return None

    data = _parse_json_from_response(text)
    if not data:
        logger.warning("JSON inválido na resposta do Gemini.")
        return None

    return _dict_to_guia_output(data)
