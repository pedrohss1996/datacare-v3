"""
DataCare - Microserviço de extração de Guias TISS (Padrão ANS).
Expõe uma rota POST que recebe imagem (multipart) e retorna JSON estruturado.
Todo o tratamento é feito somente pelo Gemini Vision: imagem → pré-processamento → Gemini → JSON.
Sem OCR (Tesseract) nem parser; exige GEMINI_API_KEY.
"""
import os
import tempfile
import logging
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from schemas import GuiaOCROutput
from image_preprocess import preprocess_for_vision
from gemini_vision import extract_guia_from_image, GEMINI_AVAILABLE

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="DataCare Guia OCR",
    description="Extração estruturada de dados de guias de atendimento (TISS) a partir de imagem.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "application/pdf"}


def _save_upload_to_temp(upload: UploadFile) -> str:
    """Salva o upload em arquivo temporário; retorna o path."""
    suffix = Path(upload.filename or "image").suffix or ".jpg"
    if suffix.lower() == ".pdf":
        # PDF: por ora não processamos; poderia usar pdf2image
        raise HTTPException(status_code=400, detail="PDF ainda não suportado. Envie JPG ou PNG.")
    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as f:
            content = upload.file.read()
            f.write(content)
        return path
    except Exception:
        os.close(fd)
        raise


@app.get("/health")
def health():
    return {"status": "ok", "service": "guia-ocr", "gemini": GEMINI_AVAILABLE}


@app.post("/ocr/guia", response_model=GuiaOCROutput)
async def ocr_guia(file: UploadFile = File(...)):
    """
    Recebe uma imagem (JPG/PNG) da guia de atendimento.
    Todo o tratamento é feito somente pelo Gemini Vision: pré-processamento da imagem + análise.
    Exige GEMINI_API_KEY configurado.
    """
    if not GEMINI_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Configure GEMINI_API_KEY no ambiente para extração de guias. Serviço usa somente Gemini Vision.",
        )
    if file.content_type and file.content_type.lower() not in ALLOWED_CONTENT_TYPES:
        if "pdf" not in (file.content_type or "").lower():
            raise HTTPException(
                status_code=400,
                detail="Tipo de arquivo não suportado. Use JPG ou PNG.",
            )
        raise HTTPException(status_code=400, detail="PDF ainda não suportado. Envie JPG ou PNG.")

    path = None
    try:
        path = _save_upload_to_temp(file)
        image_bytes, mime_type = preprocess_for_vision(path)
        result = extract_guia_from_image(image_bytes, mime_type)
        if result is None:
            raise HTTPException(
                status_code=503,
                detail="Gemini não retornou dados estruturados. Verifique a imagem e tente novamente.",
            )
        logger.info("Guia extraída via Gemini Vision.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erro ao processar imagem: %s", e)
        raise HTTPException(status_code=500, detail=f"Erro ao processar imagem: {str(e)}")
    finally:
        if path and os.path.exists(path):
            try:
                os.unlink(path)
            except OSError:
                pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
