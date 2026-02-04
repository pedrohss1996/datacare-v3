"""
Mapeamento oficial dos campos TISS (Padrão ANS).
Suporta: Guia SP/SADT, Honorário Individual, Internação, Consulta.
Versões: 3.0, 3.1, 4.0, 4.1, 4.2 (numeração 1-99 ou 001-099).
"""

# Número do campo TISS -> chave no schema GuiaOCROutput
TISS_FIELD_TO_KEY = {
    1: "codigo_operadora",
    2: "numero_guia_prestador",  # Guia no prestador (internação, etc.)
    3: "numero_guia_principal",
    4: "data_autorizacao",
    5: "senha",
    6: "data_validade_senha",
    7: "numero_guia_atribuido_operadora",
    8: "numero_carteirinha",
    9: "data_validade",
    10: "nome_paciente",
    11: "data_nascimento",  # ou CNS em algumas guias
    12: "atendimento_rn",
    13: "codigo_operadora_solicitante",
    14: "nome_contratado",
    15: "nome_profissional_solicitante",
    16: "conselho_profissional",
    17: "numero_conselho",
    18: "uf_conselho",
    19: "codigo_cbo",
    20: "assinatura_profissional_solicitante",
    21: "carater_atendimento",
    22: "data_solicitacao",
    23: "indicacao_clinica",
    24: "tabela_procedimento",  # Tabela (19, 20, 22...)
    25: "codigo_tuss_procedimento",  # usado em bloco procedimento
    26: "descricao_procedimento",
    27: "qtde_solicitada",
    28: "qtde_autorizada",
    29: "codigo_operadora_executante",
    30: "nome_contratado_executante",
    31: "codigo_cnes",
    32: "tipo_atendimento",
    36: "data_execucao",
    37: "hora_inicial",
    38: "hora_final",
    58: "observacao_justificativa",
    59: "total_procedimentos",
    60: "total_taxas_alugueis",
    61: "total_materiais",
    63: "total_medicamentos",
    64: "total_gases",
    65: "total_geral",
}

# Palavras-chave para detectar tipo de guia no texto
GUIA_TYPE_KEYWORDS = {
    "SP_SADT": [
        "guia de serviço profissional",
        "serviço auxiliar de diagnóstico",
        "sp/sadt",
        "sadt",
        "sp isadt",
        "guia sp",
    ],
    "HONORARIO": [
        "guia de honorário",
        "honorário individual",
        "guia de honorarios",
        "honorarios individuais",
    ],
    "INTERNACAO": [
        "guia de internação",
        "guia de internacao",
        "resumo de internação",
        "solicitação de internação",
    ],
    "CONSULTA": [
        "guia de consulta",
    ],
    "ODONTO": [
        "guia de tratamento odontológico",
        "gto",
        "odonto",
    ],
}

# Variações de rótulos por número (OCR costuma errar)
FIELD_LABEL_VARIANTS = {
    1: ["registro ans", "reg ans", "ans", "reg.*ans"],
    2: ["número da guia no prestador", "guia no prestador", "nº guia prestador", "nº gula no prestador"],
    3: ["n° guia principal", "numero guia principal", "guia principal", "nº guia principal", "gula principal"],
    4: ["data da autorização", "data autorização", "data da autoração", "autoração"],
    5: ["senha"],
    6: ["data validade da senha", "validade da senha"],
    7: ["número da guia atribuído", "guia atribuído", "guia atribuido", "numero guia operadora"],
    8: ["número da carteirinha", "nº carteirinha", "carteirinha", "carteira", "carfsira", "caneira"],
    9: ["validade da carteira", "validade carteira", "vaidaga da caneira"],
    10: ["nome", "nome do beneficiário", "nome do paciente", "noma", "isaoma"],
    11: ["data de nascimento", "data nascimento", "cartão nacional de saúde", "cns"],
    12: ["atendimento a rn", "atendimento rn", "atend.*rn"],
    13: ["código na operadora", "codigo na operadora", "código operadora", "essigo na oparadora"],
    14: ["nome do contratado", "nome contratado", "coniátido", "coniatado"],
    15: ["nome do profissional solicitante", "profissional solicitante", "prorerionar", "proffisionar"],
    16: ["conselho profissional", "conselho", "consaiho", "conselho pronessional"],
    17: ["número no conselho", "numero no conselho", "numero conselho", "namero no conselho"],
    18: ["uf", "uf conselho"],
    19: ["código cbo", "codigo cbo", "cbo"],
    21: ["caráter do atendimento", "carater atendimento", "carsiar do aionaimenio"],
    22: ["data da solicitação", "data solicitação", "datada solciação"],
    23: ["indicação clínica", "indicacao clinica", "indicação clinica", "madcaçauinica"],
    25: ["código do procedimento", "codigo procedimento", "código procedimento"],
    26: ["descrição", "descricao", "descriçao"],
    27: ["quantidade solicitada", "qtde solicitada"],
    28: ["quantidade autorizada", "qtde autorizada"],
    29: ["código na operadora executante", "codigo executante"],
    30: ["nome do contratado executante", "contratado executante"],
    31: ["código cnes", "codigo cnes", "cnes"],
    32: ["tipo de atendimento", "tipo atendimento"],
    58: ["observação", "observacao", "observaçao", "justificativa"],
}
