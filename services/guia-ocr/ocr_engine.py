"""
Motor de OCR: pré-processamento (OpenCV) + extração (PaddleOCR ou Tesseract fallback).
Responsável por transformar imagem em texto estruturado.
Sem dados mockados: só análise real (Tesseract/PaddleOCR).
"""
import os
import re
import logging
from pathlib import Path
from typing import Dict, List, Tuple, Optional

logger = logging.getLogger(__name__)

# Pré-processamento com OpenCV
try:
    import cv2
    import numpy as np
    HAS_OPENCV = True
except ImportError:
    HAS_OPENCV = False

# OCR: tentar PaddleOCR primeiro, depois Tesseract
PADDLE_AVAILABLE = False
TESSERACT_AVAILABLE = False

try:
    from paddleocr import PaddleOCR
    _ocr_engine = PaddleOCR(use_angle_cls=True, lang="pt", show_log=False, use_gpu=False)
    PADDLE_AVAILABLE = True
except Exception as e:
    logger.warning("PaddleOCR não disponível: %s. Usando Tesseract como fallback.", e)

def _caminhos_tesseract_windows():
    """Caminhos comuns do Tesseract no Windows."""
    paths = []
    pf = os.environ.get("ProgramFiles", r"C:\Program Files")
    pf86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    paths.append(os.path.join(pf, "Tesseract-OCR", "tesseract.exe"))
    paths.append(os.path.join(pf86, "Tesseract-OCR", "tesseract.exe"))
    paths.append(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
    paths.append(r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe")
    home = os.path.expanduser("~")
    paths.append(os.path.join(home, "AppData", "Local", "Programs", "Tesseract-OCR", "tesseract.exe"))
    return paths


if not PADDLE_AVAILABLE:
    try:
        import pytesseract
        from PIL import Image
        import sys
        # 1) Variável de ambiente TESSERACT_CMD (definir no .env da raiz ou no sistema)
        tesseract_cmd = os.environ.get("TESSERACT_CMD", "").strip()
        if tesseract_cmd and Path(tesseract_cmd).exists():
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
            logger.info("Tesseract configurado (env): %s", tesseract_cmd)
        elif sys.platform == "win32":
            for path in _caminhos_tesseract_windows():
                if path and Path(path).exists():
                    pytesseract.pytesseract.tesseract_cmd = path
                    logger.info("Tesseract configurado: %s", path)
                    break
        # Verifica se o binário responde; se falhar, não quebra o import
        try:
            pytesseract.get_tesseract_version()
        except Exception as e:
            logger.warning(
                "Tesseract não encontrado. Defina TESSERACT_CMD no .env (raiz do projeto) com o caminho do tesseract.exe. Erro: %s",
                e,
            )
        TESSERACT_AVAILABLE = True
    except ImportError:
        logger.warning("Tesseract/PIL não disponível. Instale: pip install pytesseract Pillow e o binário Tesseract (por).")


def _preprocess_image(image_path: str) -> Optional[str]:
    """
    Pré-processamento: escala de cinza, binarização, deskew.
    Retorna caminho do arquivo processado (temp) ou None.
    """
    if not HAS_OPENCV:
        return image_path

    try:
        img = cv2.imread(image_path)
        if img is None:
            return image_path

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Reduz ruído
        denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)
        # Binarização adaptativa (melhor para documentos)
        binary = cv2.adaptiveThreshold(
            denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
        out_path = image_path + ".processed.jpg"
        cv2.imwrite(out_path, binary)
        return out_path
    except Exception as e:
        logger.warning("Pré-processamento falhou: %s. Usando imagem original.", e)
        return image_path


def _deskew_image(image_path: str) -> str:
    """Correção de ângulo (deskew) para guias fotografadas tortas."""
    if not HAS_OPENCV:
        return image_path
    try:
        img = cv2.imread(image_path)
        if img is None:
            return image_path
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        coords = np.column_stack(np.where(gray > 0))
        if coords.size == 0:
            return image_path
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        else:
            angle = -angle
        (h, w) = img.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        out_path = image_path + ".deskew.jpg"
        cv2.imwrite(out_path, rotated)
        return out_path
    except Exception as e:
        logger.warning("Deskew falhou: %s", e)
        return image_path


def extract_text_from_image(image_path: str) -> Tuple[str, float]:
    """
    Extrai todo o texto da imagem.
    Retorna (texto_bruto, confidence_medio).
    """
    processed = _preprocess_image(image_path)
    processed = _deskew_image(processed)

    if PADDLE_AVAILABLE:
        try:
            result = _ocr_engine.ocr(processed, cls=True)
            if not result or not result[0]:
                return "", 0.0
            lines = []
            confidences = []
            for line in result[0]:
                if line and len(line) >= 2:
                    text = line[1][0]
                    conf = line[1][1] if isinstance(line[1][1], (int, float)) else 0.9
                    lines.append(text)
                    confidences.append(float(conf))
            text = "\n".join(lines)
            score = sum(confidences) / len(confidences) if confidences else 0.5
            return text.strip(), min(1.0, score)
        except Exception as e:
            logger.warning("PaddleOCR falhou: %s", e)

    if TESSERACT_AVAILABLE:
        def _tesseract_read(img_path: str):
            img = Image.open(img_path)
            data = pytesseract.image_to_data(img, lang="por", output_type=pytesseract.Output.DICT)
            # Agrupar por linha (line_num) para preservar quebras e ajudar o parser
            line_words: Dict[int, List[Tuple[str, float]]] = {}
            for i, word in enumerate(data["text"]):
                if not word.strip():
                    continue
                line_num = int(data["line_num"][i]) if i < len(data["line_num"]) else 0
                conf = int(data["conf"][i]) / 100.0 if data["conf"][i] >= 0 else 0.5
                line_words.setdefault(line_num, []).append((word, conf))
            lines = []
            all_confs = []
            for _ln in sorted(line_words.keys()):
                parts = [w for w, _ in line_words[_ln]]
                confs = [c for _, c in line_words[_ln]]
                lines.append(" ".join(parts))
                all_confs.extend(confs)
            text = "\n".join(lines)
            score = sum(all_confs) / len(all_confs) if all_confs else 0.5
            return text.strip(), min(1.0, score)

        try:
            text, score = _tesseract_read(processed)
            if len(text) < 50 and processed != image_path:
                try:
                    text_orig, score_orig = _tesseract_read(image_path)
                    if len(text_orig) > len(text):
                        return text_orig, score_orig
                except Exception:
                    pass
            return text, score
        except Exception as e:
            logger.warning("Tesseract falhou: %s", e)

    # Sem OCR disponível: retorna vazio. Instale Tesseract para análise real.
    logger.warning("Nenhum motor de OCR disponível. Use Tesseract (binário + pytesseract) ou PaddleOCR para análise real do documento.")
    return ("", 0.0)
