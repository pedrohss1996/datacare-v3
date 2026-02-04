"""
Parser TISS: texto bruto do OCR -> GuiaOCROutput.
Suporta: SP/SADT, Honorário, Internação, Consulta (versões 3.x e 4.x).
Estratégia: extração por linha (N - Label : valor) + fallback regex.
"""
import re
from typing import List, Optional, Dict, Tuple

from schemas import GuiaOCROutput, ProcedimentoItem
from tiss_fields import (
    TISS_FIELD_TO_KEY,
    GUIA_TYPE_KEYWORDS,
    FIELD_LABEL_VARIANTS,
)

# Padrão de data: DD/MM/YYYY ou DD-MM-YYYY
_DATE = r"(\d{2}[/\-]\d{2}[/\-]\d{4})"


def _normalize_for_ocr(text: str) -> str:
    """Normaliza texto para facilitar matching (OCR costuma trocar caracteres)."""
    if not text:
        return ""
    t = re.sub(r"\r\n", "\n", text)
    t = re.sub(r" +", " ", t)
    t = re.sub(r"º", "°", t)
    for d in range(10):
        t = re.sub(r"[\|\[]\s*" + str(d), " " + str(d), t)
    t = re.sub(r"\|\s*", " ", t)
    t = re.sub(r"\[\s*", " ", t)
    return t.strip()


def detect_tipo_guia(text: str) -> Tuple[str, Optional[str]]:
    """Detecta tipo de guia e versão TISS pelo conteúdo. Retorna (tipo_guia, versao)."""
    t = (text or "").lower()
    versao = None
    m_ver = re.search(r"tiss\s*[:\s]*(\d+[.\d]+)|vers[aã]o\s*[:\s]*(\d+[.\d]+)|(\d+\.\d{2})\s*(?:tiss|padr[aã]o)", t)
    if m_ver:
        versao = (m_ver.group(1) or m_ver.group(2) or m_ver.group(3) or "").strip()
    if not versao:
        for v in ["4.02", "4.01", "4.00", "4.2", "4.1", "4.0", "3.05", "3.04", "3.0"]:
            if v in t:
                versao = v
                break
    for tipo, keywords in GUIA_TYPE_KEYWORDS.items():
        for kw in keywords:
            if kw in t or kw.replace(" ", "") in t.replace(" ", ""):
                return (tipo, versao)
    return ("OUTROS", versao)


def extract_fields_by_lines(text: str) -> Dict[int, str]:
    """
    Extrai campos TISS por linha: "N - Label : valor" ou "N Label : valor".
    Retorna dict numero_campo -> valor (string).
    """
    result: Dict[int, str] = {}
    lines = text.split("\n")
    # Padrão: número (1-3 dígitos) opcional - ou . depois texto até : ou | depois valor
    pat_num_val = re.compile(
        r"^\s*(\d{1,3})\s*[-–.]?\s*[^:\|]*[:\|]\s*(.+)$",
        re.IGNORECASE,
    )
    for line in lines:
        line = line.strip()
        if not line or len(line) < 4:
            continue
        m = pat_num_val.search(line)
        if m:
            num = int(m.group(1))
            val = (m.group(2) or "").strip()
            if num in TISS_FIELD_TO_KEY and val and num not in result:
                result[num] = val
            continue
        # Sem número no início: tentar "Label : valor" ou "Label valor" (valor no final)
        for field_num, labels in FIELD_LABEL_VARIANTS.items():
            if field_num in result:
                continue
            for label in labels:
                frag = label[:14].strip()
                if not frag or len(line) < len(frag) + 2:
                    continue
                try:
                    pat = re.compile(re.escape(frag) + r"[^:\|]*[:\|]\s*(.+)", re.IGNORECASE)
                    m_sep = pat.search(line)
                    if m_sep:
                        val = m_sep.group(1).strip()
                        if val and len(val) < 500:
                            result[field_num] = val
                            break
                except re.error:
                    pass
            if field_num in result:
                continue
            # Valor no final da linha (ex.: "Nº Guia no Prestador 69376305")
            for label in labels:
                frag = label[:10].strip()
                if frag in line.lower() and field_num in (2, 3, 7, 8):
                    m_tail = re.search(r"(\d{6,})\s*$", line)
                    if m_tail:
                        result[field_num] = m_tail.group(1).strip()
                        break
    return result


def _extract_first_match(text: str, patterns: List[str]) -> Optional[str]:
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE | re.MULTILINE | re.DOTALL)
        if m:
            val = (m.group(1) if m.lastindex and m.lastindex >= 1 else m.group(0) or "").strip()
            if val:
                return val
    return None


def _campo(num: int, nome: str, valor: str = r"([^\n]+?)") -> str:
    esc = re.escape(nome)
    return rf"(?:{num}\s*[-–]?\s*{esc}|{esc})\s*[:\s]+\s*{valor}"


# Fallback: padrões regex quando extração por linha não encontra
PATTERNS = {
    "codigo_operadora": [
        r"(?:1\s*[-–]?\s*Registro ANS|Registro ANS)\s*[:\s]+\s*(\d{4,6})",
        r"Reg\w*ANS\s*[:\|]?\s*(\d{4,6})",
        r"ANS\s*[:\|]?\s*(\d{4,6})",
        r"Conta\s*:\s*(\d{6,})",
    ],
    "numero_guia_prestador": [
        r"N[°º]?\s*Gula?\s+no\s+Prestador\s+(\d+)",
        r"Guia\s+no\s+Prestador\s+(\d{6,})",
    ],
    "numero_guia_principal": [
        _campo(3, "N° Guia Principal", r"([^\n]+)"),
        r"3\s*[-–]?\s*[^\n]*Guia Principal\s*[:\|]?\s*(\d[\d\s\-]*)",
        r"Afend\.\s*:\s*(\d{6,})",
        r"Guia\s+no\s+Prestador\s+(\d{6,})",
    ],
    "data_autorizacao": [
        _campo(4, "Data da Autorização", _DATE),
        r"Data da Autoriza[çc]?[ãa]?o\s*[:\|]?\s*" + _DATE,
    ],
    "senha": [
        _campo(5, "Senha", r"(\d[\d\s]*)"),
        r"5\s*[-–]\s*Senha\s*[:\|]?\s*(\d+)",
        r"Senha\s*[:\|]?\s*(\d[\d\s]*)",
    ],
    "data_validade_senha": [_campo(6, "Data Validade da Senha", _DATE)],
    "numero_guia_atribuido_operadora": [
        _campo(7, "Número da Guia Atribuído pela Operadora", r"(\d[\d\s]*)"),
        r"7\s*[-–][^\n]*[:\|]?\s*(\d[\d\s]*)",
        r"Guia Atribu[íi]do\s*[:\|]?\s*(\d[\d\s]*)",
    ],
    "numero_carteirinha": [
        r"(?:8\s*[-–]?\s*N[°º]?\.?\s*da Carteirinha|N[°º]?\.?\s*da Carteirinha)\s*[:\|]?\s*(\d[\d\s]*)",
        r"Car[tf]?s?[ei]?ra\s*[:\|]?\s*(\d[\d\s]{6,})",
        r"N\s+(\d{6,})\s*(?:Hosp|Conta|$|\d{2}/\d{2})",
        r"(?:Carteira|Carfsira|Caneira)\s*[:\|]?\s*(\d[\d\s]*)",
    ],
    "data_validade": [
        _campo(9, "Validade da Carteira", _DATE),
        r"V[aá]?lid[aá]?d[eae]?\s+da\s+Car\w*ra\s*[:\|]?\s*" + _DATE,
    ],
    "nome_paciente": [
        r"10\s*[-–]?\s*Nome\s*[:\|]?\s*([^\n]+?)(?=\s*\n\s*11\s|\s+\d{2}/\d{2}/\d{4}|$)",
        r"(?:10\s*[-–]?\s*Nome|Nome|Noma|isaoma)\s*[:\|]?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{5,}?)(?=\s+N\s+\d{6}|\s+Hosp|\s+\d{2}/\d{2}/\d{4}|$)",
        r"Nome\s*[:\|]?\s*([A-Za-zÀ-ÿ][^\n]{3,})",
        r"([A-Za-zÀ-ÿ][a-zà-ÿ]+\s+[A-Za-zÀ-ÿ][a-zà-ÿ]+\s+da\s+[A-Za-zÀ-ÿ][a-zà-ÿ]+)\s+(?:N\s+\d{6}|Hosp)",
    ],
    "data_nascimento": [
        _campo(11, "Data de Nascimento", _DATE),
        r"11\s*[-–][^\n]*[:\|]?\s*" + _DATE,
        r"Data de Nascimento\s*[:\|]?\s*" + _DATE,
    ],
    "atendimento_rn": [
        _campo(12, "Atendimento a RN", r"([SN])"),
        r"12\s*[-–][^\n]*[:\|]?\s*([SN])",
    ],
    "codigo_operadora_solicitante": [_campo(13, "Código na Operadora", r"(\d+)"), r"13\s*[-–][^\n]*[:\|]?\s*(\d+)"],
    "nome_contratado": [
        _campo(14, "Nome do Contratado", r"([^\n]+)"),
        r"14\s*[-–][^\n]*[:\|]?\s*([^\n]+)",
        r"Noma?\s+do\s+Coni[aá]tado\s*[:\|]?\s*([^\n]+)",
        r"([A-Za-zÀ-ÿ][^\n]*(?:tda|Ltda|S\/A)[.\s]?)",
        r"(Hosp\w*\s+do\s+Cor[aá]ção[^\n]*(?:tda|Ltda)?)",
    ],
    "nome_profissional_solicitante": [
        _campo(15, "Nome do Profissional Solicitante", r"([^\n]+)"),
        r"15\s*[-–][^\n]*[:\|]?\s*([^\n]+)",
        r"([A-Za-zÀ-ÿ][a-zà-ÿ]+\s+[A-Za-zÀ-ÿ][a-zà-ÿ]+\s+[A-Za-zÀ-ÿ][a-zà-ÿ]+)\s+os\s+Exa",
    ],
    "conselho_profissional": [_campo(16, "Conselho Profissional", r"(\d+)")],
    "numero_conselho": [_campo(17, "Número no Conselho", r"([^\n]+)")],
    "uf_conselho": [_campo(18, "UF", r"([A-Z]{2})"), r"18\s*[-–]\s*UF\s*[:\|]?\s*([A-Z]{2})"],
    "codigo_cbo": [_campo(19, "Código CBO", r"(\d+)")],
    "carater_atendimento": [_campo(21, "Caráter do Atendimento", r"(\d)"), r"21\s*[-–][^\n]*[:\|]?\s*(\d)"],
    "data_solicitacao": [
        _campo(22, "Data da Solicitação", _DATE),
        r"22\s*[-–][^\n]*[:\|]?\s*" + _DATE,
        r"(\d{2}/\d{2}/\d{4})\s+[A-Z]{2,}\s+[A-Z]",
    ],
    "indicacao_clinica": [
        _campo(23, "Indicação Clínica", r"([^\n]+)"),
        r"Indica[çc][ãa]o Cl[íi]nica\s*[:\|]?\s*([^\n]+)",
        r"\d{2}/\d{2}/\d{4}\s+([A-Z][A-Za-z\s]{4,}?)(?=\s+1\.\s+2\s+|\s+\d{6,}\.|$)",
        r"\d{2}/\d{2}/\d{4}\s+([A-Z][A-Z\s]+(?:BAIXA|ALTA|CRÔNIC)[A-Z\s]*)",
    ],
    "tipo_atendimento": [_campo(32, "Tipo de Atendimento", r"(\d)"), r"32\s*[-–][^\n]*[:\|]?\s*(\d)"],
    "observacao_justificativa": [
        _campo(58, "Observação", r"([^\n]+)"),
        r"58\s*[-–][^\n]*[:\|]?\s*([^\n]+)",
    ],
    "codigo_operadora_executante": [r"29\s*[-–][^\n]*[:\|]?\s*(\d+)"],
    "nome_contratado_executante": [r"30\s*[-–][^\n]*[:\|]?\s*([^\n]+)"],
    "codigo_cnes": [r"31\s*[-–][^\n]*[:\|]?\s*(\d+)"],
    "procedimento_codigo_desc": [
        r"(\d{6,8})\s*[.\s]+\s*([A-Za-zÀ-ÿ][^\n]{4,})",
        r"\b(\d{8})\s+([A-Z][A-Za-zÀ-ÿ\-]+(?:Bilateral|\(ambos\))[^\n]*)",
        r"\b(\d{8})\s*[-–]\s*([A-Za-zÀ-ÿ][^\n]{4,})",
    ],
    "procedimento_linha": [
        r"\b(\d{8})\s+([A-Za-zÀ-ÿ][^\n]+)",
        r"\b(\d{6,8})\s+([A-Z][A-Za-zÀ-ÿ\-]+)",
    ],
}


def _extract_procedimentos(text: str, field_by_num: Dict[int, str]) -> List[ProcedimentoItem]:
    """Extrai procedimentos: primeiro dos campos 25/26 por linha, depois regex."""
    items: List[ProcedimentoItem] = []
    seen: set = set()
    # Blocos 25+26 da extração por linha (quando valor está em campo 25 e 26)
    cod_25 = field_by_num.get(25)
    desc_26 = field_by_num.get(26)
    if cod_25 and desc_26:
        cod = re.sub(r"\s+", "", cod_25.strip())
        if cod and len(cod) >= 5 and cod not in seen:
            seen.add(cod)
            items.append(ProcedimentoItem(codigo_tuss=cod, descricao=desc_26.strip()[:200]))
    for pat in PATTERNS["procedimento_codigo_desc"] + PATTERNS["procedimento_linha"]:
        for m in re.finditer(pat, text, re.IGNORECASE | re.MULTILINE | re.DOTALL):
            if m.lastindex >= 2:
                cod = re.sub(r"\s+", "", (m.group(1) or "").strip())
                desc = (m.group(2) or "").strip()
                if cod and len(cod) >= 5 and desc and cod not in seen and re.search(r"[A-Za-zÀ-ÿ]", desc):
                    seen.add(cod)
                    items.append(ProcedimentoItem(codigo_tuss=cod, descricao=desc[:200]))
    if not items:
        for line in text.split("\n"):
            if re.search(r"\d{6,}", line):
                m = re.search(r"(\d{6,8})\s*[.\s]+\s*([A-Za-zÀ-ÿ][^\n]{2,})", line)
                if m:
                    cod, desc = m.group(1).strip(), m.group(2).strip()
                    if desc and cod not in seen:
                        seen.add(cod)
                        items.append(ProcedimentoItem(codigo_tuss=cod, descricao=desc[:200]))
    return items[:30]


def _map_fields_to_schema(field_by_num: Dict[int, str]) -> Dict[str, Optional[str]]:
    """Converte dict numero_campo -> valor em dict chave_schema -> valor."""
    out: Dict[str, Optional[str]] = {}
    for num, val in field_by_num.items():
        key = TISS_FIELD_TO_KEY.get(num)
        if key and key in (
            "codigo_operadora",
            "numero_guia_prestador",
            "numero_guia_principal",
            "data_autorizacao",
            "senha",
            "data_validade_senha",
            "numero_guia_atribuido_operadora",
            "numero_carteirinha",
            "data_validade",
            "nome_paciente",
            "data_nascimento",
            "atendimento_rn",
            "codigo_operadora_solicitante",
            "nome_contratado",
            "nome_profissional_solicitante",
            "conselho_profissional",
            "numero_conselho",
            "uf_conselho",
            "codigo_cbo",
            "carater_atendimento",
            "data_solicitacao",
            "indicacao_clinica",
            "tipo_atendimento",
            "observacao_justificativa",
            "codigo_operadora_executante",
            "nome_contratado_executante",
            "codigo_cnes",
        ):
            out[key] = val.strip() if val else None
    return out


def parse_raw_text_to_guia(raw_text: str, confidence_base: float) -> GuiaOCROutput:
    """Converte o texto bruto do OCR na estrutura GuiaOCROutput (TISS completo)."""
    raw_text = raw_text or ""
    text_norm = _normalize_for_ocr(raw_text)

    tipo_guia, versao_tiss = detect_tipo_guia(text_norm)
    field_by_num = extract_fields_by_lines(text_norm)
    from_schema = _map_fields_to_schema(field_by_num)

    def get(key: str) -> Optional[str]:
        if from_schema.get(key):
            return from_schema[key]
        patterns = PATTERNS.get(key)
        if patterns:
            return _extract_first_match(text_norm, patterns)
        return None

    cod_op = get("codigo_operadora")
    numero_guia_prestador = get("numero_guia_prestador")
    numero_guia_principal = get("numero_guia_principal") or numero_guia_prestador
    data_autorizacao = get("data_autorizacao")
    senha = get("senha")
    data_validade_senha = get("data_validade_senha")
    numero_guia_atribuido = get("numero_guia_atribuido_operadora")
    carteirinha = get("numero_carteirinha")
    validade = get("data_validade")
    nome = get("nome_paciente")
    data_nasc = get("data_nascimento")
    atendimento_rn = get("atendimento_rn")
    cod_solicitante = get("codigo_operadora_solicitante")
    nome_contratado = get("nome_contratado")
    nome_prof_solicitante = get("nome_profissional_solicitante")
    conselho = get("conselho_profissional")
    numero_conselho = get("numero_conselho")
    uf = get("uf_conselho")
    codigo_cbo = get("codigo_cbo")
    carater = get("carater_atendimento")
    data_solicitacao = get("data_solicitacao")
    indicacao_clinica = get("indicacao_clinica")
    tipo_atendimento = get("tipo_atendimento")
    observacao = get("observacao_justificativa")
    cod_executante = get("codigo_operadora_executante")
    nome_executante = get("nome_contratado_executante")
    codigo_cnes = get("codigo_cnes")

    procedimentos = _extract_procedimentos(text_norm, field_by_num)

    if nome:
        nome = re.sub(r"\s*11\s*[-–].*$", "", nome).strip()
        nome = re.sub(r"\d{2}/\d{2}/\d{4}\s*$", "", nome).strip()
    if carteirinha:
        carteirinha = re.sub(r"\s+", "", carteirinha)
    if numero_guia_atribuido:
        numero_guia_atribuido = re.sub(r"\s+", "", numero_guia_atribuido)

    campos_ok = sum([
        bool(nome),
        bool(carteirinha),
        bool(cod_op),
        bool(procedimentos),
    ])
    confidence = confidence_base * (0.5 + 0.12 * min(campos_ok, 4))
    confidence = min(1.0, max(0.0, confidence))

    return GuiaOCROutput(
        tipo_guia=tipo_guia,
        versao_tiss=versao_tiss,
        codigo_operadora=cod_op,
        numero_guia_prestador=numero_guia_prestador,
        numero_guia_principal=numero_guia_principal,
        data_autorizacao=data_autorizacao,
        senha=senha,
        data_validade_senha=data_validade_senha,
        numero_guia_atribuido_operadora=numero_guia_atribuido,
        numero_carteirinha=carteirinha,
        data_validade=validade,
        nome_paciente=nome,
        data_nascimento=data_nasc,
        atendimento_rn=atendimento_rn,
        codigo_operadora_solicitante=cod_solicitante,
        nome_contratado=nome_contratado,
        nome_profissional_solicitante=nome_prof_solicitante,
        conselho_profissional=conselho,
        numero_conselho=numero_conselho,
        uf_conselho=uf,
        codigo_cbo=codigo_cbo,
        carater_atendimento=carater,
        data_solicitacao=data_solicitacao,
        indicacao_clinica=indicacao_clinica,
        lista_procedimentos=procedimentos,
        codigo_operadora_executante=cod_executante,
        nome_contratado_executante=nome_executante,
        codigo_cnes=codigo_cnes,
        tipo_atendimento=tipo_atendimento,
        observacao_justificativa=observacao,
        nome_operadora=None,
        confidence_score=round(confidence, 2),
        raw_text=raw_text[:5000] if raw_text else None,
    )
