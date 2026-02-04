"""
Cliente Gemini: envia texto OCR da guia TISS para a API do Google Gemini
e recebe JSON estruturado com todos os campos organizados.
Fallback: se GEMINI_API_KEY não estiver definido ou a chamada falhar, retorna None.
"""
import json
import logging
import os
import re
from typing import Optional, Any, Dict, List

from schemas import GuiaOCROutput, ProcedimentoItem

logger = logging.getLogger(__name__)

GEMINI_AVAILABLE = False
try:
    import google.generativeai as genai
    if os.environ.get("GEMINI_API_KEY"):
        genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
        GEMINI_AVAILABLE = True
    else:
        logger.info("GEMINI_API_KEY não definido. Extração via Gemini desativada.")
except ImportError:
    logger.warning("google-generativeai não instalado. pip install google-generativeai")

# Prompt DataCare: extração em camadas (segmentação → extração → sanitização → cross-reference → saída)
PROMPT_TEMPLATE = """Você é um especialista em guias TISS (Padrão ANS) do Brasil. Abaixo está o texto extraído por OCR de uma imagem de guia de convênio. O texto pode ter erros de OCR. Siga este raciocínio em camadas:

**1. SEGMENTAÇÃO POR REGIÕES (Layout Mapping)** – Identifique os blocos: Header (guia, autorização, senha), Beneficiário (paciente, carteirinha), Solicitante/Executante (médico, hospital, CNES), Grid de Procedimentos (códigos TUSS e valores), Footer Financeiro (totais).

**2. EXTRAÇÃO VIA PARES CHAVE-VALOR** – Para cada bloco, localize âncoras (ex.: "5 - Senha", "Código do Procedimento") e o valor à direita ou abaixo. Corrija erros de OCR (ex.: Lourdas→Lourdes, Carfsira→Carteirinha).

**3. TIPAGEM E VALIDAÇÃO** – Datas em DD/MM/AAAA. Moeda em número (float, ex.: 352.77). Códigos TUSS com 8 dígitos (preencha zeros à esquerda se necessário).

**4. CROSS-REFERENCE** – Valide se procedimentos + taxas + materiais + medicamentos = total geral. Identifique executante pelo CNES/nome (ex.: Hospital Anis Rassi).

**5. SAÍDA ESTRUTURADA** – Retorne UM ÚNICO objeto JSON válido, sem markdown, sem texto antes/depois. Use null para ausentes. Estrutura obrigatória:

{
  "guia": "número principal da guia",
  "status": "autorizada ou pendente ou cancelada",
  "paciente": { "nome": "nome completo", "carteira": "número carteirinha" },
  "faturamento": {
    "itens": [ { "codigo": "40202038", "descricao": "Descrição", "valor": 127.72 } ],
    "totais": { "procedimentos": 127.72, "taxas": 144.94, "materiais": 21.53, "medicamentos": 58.58, "geral": 352.77 }
  },
  "tipo_guia": "SP_SADT ou HONORARIO ou INTERNACAO ou CONSULTA ou ODONTO ou OUTROS",
  "versao_tiss": "4.0 ou 3.0 ou null",
  "codigo_operadora": "Registro ANS",
  "numero_guia_prestador": null,
  "numero_guia_principal": null,
  "data_autorizacao": "DD/MM/AAAA",
  "senha": null,
  "data_validade_senha": "DD/MM/AAAA",
  "numero_guia_atribuido_operadora": null,
  "numero_carteirinha": null,
  "data_validade": "DD/MM/AAAA",
  "nome_paciente": null,
  "data_nascimento": "DD/MM/AAAA",
  "atendimento_rn": "S ou N",
  "codigo_operadora_solicitante": null,
  "nome_contratado": null,
  "nome_profissional_solicitante": null,
  "conselho_profissional": null,
  "numero_conselho": null,
  "uf_conselho": null,
  "codigo_cbo": null,
  "carater_atendimento": null,
  "data_solicitacao": "DD/MM/AAAA",
  "indicacao_clinica": null,
  "tipo_atendimento": null,
  "observacao_justificativa": null,
  "codigo_operadora_executante": null,
  "nome_contratado_executante": null,
  "codigo_cnes": null,
  "lista_procedimentos": [ { "codigo_tuss": "40202038", "descricao": "Descrição", "valor": 127.72 } ]
}

Preencha todos os campos que encontrar no texto. Em faturamento.itens e lista_procedimentos inclua código (8 dígitos), descrição e valor numérico. Responda SOMENTE com o JSON.

Texto OCR da guia:
---
{raw_text}
---"""


def _parse_json_from_response(text: str) -> Optional[Dict[str, Any]]:
    """Extrai JSON da resposta do modelo (pode vir dentro de ```json ... ```)."""
    if not text or not text.strip():
        return None
    text = text.strip()
    # Remove blocos markdown
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if m:
        text = m.group(1).strip()
    # Tenta parsear
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Última tentativa: achar primeiro { até último }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass
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


def _dict_to_guia_output(data: Dict[str, Any], raw_text: str, confidence_base: float) -> GuiaOCROutput:
    """Converte o dicionário retornado pelo Gemini (estrutura guia/paciente/faturamento + flat) em GuiaOCROutput."""
    def get(key: str) -> Optional[str]:
        v = data.get(key)
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return str(v).strip() if v else None

    # Preferir estrutura "coração" DataCare (guia, paciente, faturamento) quando existir
    guia_num = get("guia") or get("numero_guia_principal") or get("numero_guia_prestador")
    paciente = data.get("paciente")
    if isinstance(paciente, dict):
        nome_paciente = (paciente.get("nome") or "").strip() or get("nome_paciente")
        numero_carteirinha = (paciente.get("carteira") or "").strip() or get("numero_carteirinha")
    else:
        nome_paciente = get("nome_paciente")
        numero_carteirinha = get("numero_carteirinha")

    faturamento = data.get("faturamento")
    itens_fat = []
    totais_proc = totais_taxas = totais_mat = totais_med = total_geral = None
    if isinstance(faturamento, dict):
        itens_raw = faturamento.get("itens") or faturamento.get("itens_procedimentos")
        if isinstance(itens_raw, list):
            for p in itens_raw[:30]:
                if isinstance(p, dict):
                    cod = (p.get("codigo_tuss") or p.get("codigo") or "").strip()
                    desc = (p.get("descricao") or p.get("desc") or "").strip()
                    val = _safe_float(p.get("valor"))
                    if cod:
                        itens_fat.append(ProcedimentoItem(codigo_tuss=cod, descricao=desc[:200] if desc else "-", valor=val))
        tot = faturamento.get("totais")
        if isinstance(tot, dict):
            totais_proc = _safe_float(tot.get("procedimentos"))
            totais_taxas = _safe_float(tot.get("taxas"))
            totais_mat = _safe_float(tot.get("materiais"))
            totais_med = _safe_float(tot.get("medicamentos"))
            total_geral = _safe_float(tot.get("geral"))

    # Lista flat lista_procedimentos (com valor se vier)
    def get_list(key: str) -> List[ProcedimentoItem]:
        items = data.get(key)
        if not isinstance(items, list):
            return []
        out = []
        for p in items[:30]:
            if isinstance(p, dict):
                cod = (p.get("codigo_tuss") or p.get("codigo") or "").strip()
                desc = (p.get("descricao") or p.get("desc") or "").strip()
                val = _safe_float(p.get("valor"))
                if cod:
                    out.append(ProcedimentoItem(codigo_tuss=cod, descricao=desc[:200] if desc else "-", valor=val))
            elif isinstance(p, (list, tuple)) and len(p) >= 2:
                out.append(ProcedimentoItem(codigo_tuss=str(p[0]).strip(), descricao=str(p[1]).strip()[:200]))
        return out

    procedimentos = itens_fat if itens_fat else get_list("lista_procedimentos")
    status_guia = get("status")

    campos_ok = sum([
        bool(nome_paciente),
        bool(numero_carteirinha),
        bool(get("codigo_operadora") or guia_num),
        bool(procedimentos),
    ])
    confidence = min(1.0, confidence_base * (0.6 + 0.1 * min(campos_ok, 4)))

    return GuiaOCROutput(
        tipo_guia=get("tipo_guia"),
        versao_tiss=get("versao_tiss"),
        codigo_operadora=get("codigo_operadora"),
        numero_guia_prestador=get("numero_guia_prestador") or (guia_num if not get("numero_guia_principal") else None),
        numero_guia_principal=get("numero_guia_principal") or guia_num,
        data_autorizacao=get("data_autorizacao"),
        senha=get("senha"),
        data_validade_senha=get("data_validade_senha"),
        numero_guia_atribuido_operadora=get("numero_guia_atribuido_operadora"),
        numero_carteirinha=numero_carteirinha,
        data_validade=get("data_validade"),
        nome_paciente=nome_paciente,
        data_nascimento=get("data_nascimento"),
        atendimento_rn=get("atendimento_rn"),
        codigo_operadora_solicitante=get("codigo_operadora_solicitante"),
        nome_contratado=get("nome_contratado"),
        nome_profissional_solicitante=get("nome_profissional_solicitante"),
        conselho_profissional=get("conselho_profissional"),
        numero_conselho=get("numero_conselho"),
        uf_conselho=get("uf_conselho"),
        codigo_cbo=get("codigo_cbo"),
        carater_atendimento=get("carater_atendimento"),
        data_solicitacao=get("data_solicitacao"),
        indicacao_clinica=get("indicacao_clinica"),
        lista_procedimentos=procedimentos,
        codigo_operadora_executante=get("codigo_operadora_executante"),
        nome_contratado_executante=get("nome_contratado_executante"),
        codigo_cnes=get("codigo_cnes"),
        tipo_atendimento=get("tipo_atendimento"),
        observacao_justificativa=get("observacao_justificativa"),
        status_guia=status_guia,
        total_procedimentos=totais_proc,
        total_taxas=totais_taxas,
        total_materiais=totais_mat,
        total_medicamentos=totais_med,
        total_geral=total_geral,
        nome_operadora=None,
        confidence_score=round(confidence, 2),
        raw_text=(raw_text[:5000] if raw_text else None),
    )


def extract_guia_with_gemini(raw_text: str, confidence_base: float = 0.85) -> Optional[GuiaOCROutput]:
    """
    Envia o texto OCR para o Gemini e retorna GuiaOCROutput estruturado.
    Retorna None se Gemini não estiver configurado ou a chamada falhar.
    """
    if not GEMINI_AVAILABLE or not raw_text or len(raw_text.strip()) < 20:
        return None

    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        prompt = PROMPT_TEMPLATE.format(raw_text=raw_text[:15000])
        response = model.generate_content(prompt)
        text = None
        if hasattr(response, "text") and response.text:
            text = response.text
        elif getattr(response, "candidates", None) and len(response.candidates) > 0:
            c = response.candidates[0]
            if getattr(c, "content", None) and getattr(c.content, "parts", None) and len(c.content.parts) > 0:
                text = getattr(c.content.parts[0], "text", None)
        if not text:
            logger.warning("Gemini retornou resposta vazia.")
            return None

        data = _parse_json_from_response(text)
        if not data:
            logger.warning("Não foi possível extrair JSON da resposta do Gemini.")
            return None

        return _dict_to_guia_output(data, raw_text, confidence_base)
    except Exception as e:
        logger.exception("Erro ao chamar Gemini: %s", e)
        return None
