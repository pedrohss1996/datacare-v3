"""
Schemas Pydantic para entrada/saída do serviço de OCR de guias TISS.
Campos conforme Padrão ANS: SP/SADT, Honorário, Internação, Consulta.
Versões: 3.0, 3.1, 4.0, 4.1, 4.2.
"""
from typing import List, Optional
from pydantic import BaseModel, Field


class ProcedimentoItem(BaseModel):
    """Procedimento ou item assistencial (campos 24 a 28 TISS)."""
    tabela: Optional[str] = Field(None, description="24 - Tabela")
    codigo_tuss: str = Field(..., description="25 - Código do procedimento TUSS")
    descricao: str = Field(..., description="26 - Descrição")
    qtde_solic: Optional[str] = Field(None, description="27 - Qtde. solicitada")
    qtde_aut: Optional[str] = Field(None, description="28 - Qtde. autorizada")
    valor: Optional[float] = Field(None, description="Valor unitário/total do procedimento (faturamento)")


class GuiaOCROutput(BaseModel):
    """Resposta estruturada do OCR – campos TISS unificados (SP/SADT, Honorário, Internação)."""
    # Identificação da guia
    tipo_guia: Optional[str] = Field(None, description="SP_SADT | HONORARIO | INTERNACAO | CONSULTA | ODONTO | OUTROS")
    versao_tiss: Optional[str] = Field(None, description="3.0 | 3.1 | 4.0 | 4.1 | 4.2")
    # Dados da guia principal (1–7)
    codigo_operadora: Optional[str] = Field(None, description="1 - Registro ANS")
    numero_guia_prestador: Optional[str] = Field(None, description="2 - Nº Guia no Prestador (internação)")
    numero_guia_principal: Optional[str] = Field(None, description="3 - N° Guia Principal")
    data_autorizacao: Optional[str] = Field(None, description="4 - Data da Autorização")
    senha: Optional[str] = Field(None, description="5 - Senha")
    data_validade_senha: Optional[str] = Field(None, description="6 - Data Validade da Senha")
    numero_guia_atribuido_operadora: Optional[str] = Field(None, description="7 - Número da Guia Atribuído pela Operadora")
    # Beneficiário (8–12)
    numero_carteirinha: Optional[str] = Field(None, description="8 - Número da Carteirinha")
    data_validade: Optional[str] = Field(None, description="9 - Validade da Carteira")
    nome_paciente: Optional[str] = Field(None, description="10 - Nome do beneficiário")
    data_nascimento: Optional[str] = Field(None, description="11 - Data de Nascimento / CNS")
    atendimento_rn: Optional[str] = Field(None, description="12 - Atendimento a RN")
    # Solicitante (13–19)
    codigo_operadora_solicitante: Optional[str] = Field(None, description="13 - Código na Operadora")
    nome_contratado: Optional[str] = Field(None, description="14 - Nome do Contratado")
    nome_profissional_solicitante: Optional[str] = Field(None, description="15 - Nome do Profissional Solicitante")
    conselho_profissional: Optional[str] = Field(None, description="16 - Conselho Profissional")
    numero_conselho: Optional[str] = Field(None, description="17 - Número no Conselho")
    uf_conselho: Optional[str] = Field(None, description="18 - UF")
    codigo_cbo: Optional[str] = Field(None, description="19 - Código CBO")
    # Solicitação (21–23)
    carater_atendimento: Optional[str] = Field(None, description="21 - Caráter do Atendimento")
    data_solicitacao: Optional[str] = Field(None, description="22 - Data da Solicitação")
    indicacao_clinica: Optional[str] = Field(None, description="23 - Indicação Clínica")
    # Procedimentos (24–28)
    lista_procedimentos: List[ProcedimentoItem] = Field(default_factory=list)
    # Executante / Atendimento (29–32)
    codigo_operadora_executante: Optional[str] = Field(None, description="29 - Código na Operadora (executante)")
    nome_contratado_executante: Optional[str] = Field(None, description="30 - Nome do Contratado (executante)")
    codigo_cnes: Optional[str] = Field(None, description="31 - Código CNES")
    tipo_atendimento: Optional[str] = Field(None, description="32 - Tipo de Atendimento")
    # Observação (58)
    observacao_justificativa: Optional[str] = Field(None, description="58 - Observação / Justificativa")
    # Status e faturamento (cross-reference DataCare)
    status_guia: Optional[str] = Field(None, description="autorizada | pendente | cancelada")
    total_procedimentos: Optional[float] = Field(None, description="Soma dos valores de procedimentos (R$)")
    total_taxas: Optional[float] = Field(None, description="Total taxas e aluguéis (R$)")
    total_materiais: Optional[float] = Field(None, description="Total materiais (R$)")
    total_medicamentos: Optional[float] = Field(None, description="Total medicamentos (R$)")
    total_geral: Optional[float] = Field(None, description="Valor total geral da guia (R$)")
    # Metadados
    nome_operadora: Optional[str] = Field(None, description="Nome do convênio (enriquecido)")
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    raw_text: Optional[str] = Field(None, description="Texto bruto (auditoria)")
