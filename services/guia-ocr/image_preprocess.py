"""
Pré-processamento de imagem para máxima legibilidade pelo Gemini Vision.
Objetivo: entregar a imagem o mais visível possível (contraste, nitidez, orientação).
"""
import io
import logging
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

try:
    import cv2
    import numpy as np
    HAS_OPENCV = True
except ImportError:
    HAS_OPENCV = False


# Tamanho máximo (lado maior) para não estourar limite da API; mantém aspecto
MAX_SIZE = 2048
JPEG_QUALITY = 95
# CLAHE: clipLimit mais alto para documentos escaneados (texto em fundo claro)
CLAHE_CLIP = 2.5
CLAHE_GRID = (8, 8)


def _deskew(img: "np.ndarray") -> "np.ndarray":
    """Corrige leve rotação do documento."""
    if not HAS_OPENCV or img is None:
        return img
    try:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        coords = np.column_stack(np.where(gray > 0))
        if coords.size < 100:
            return img
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        else:
            angle = -angle
        if abs(angle) < 0.3:
            return img
        h, w = img.shape[:2]
        M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
        return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    except Exception as e:
        logger.warning("Deskew falhou: %s", e)
        return img


def _enhance_contrast(img: "np.ndarray") -> "np.ndarray":
    """CLAHE no canal L (Lab) para melhorar contraste em documentos (máxima legibilidade para o Gemini)."""
    if not HAS_OPENCV or img is None:
        return img
    try:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=CLAHE_CLIP, tileGridSize=CLAHE_GRID)
        l = clahe.apply(l)
        lab = cv2.merge([l, a, b])
        return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    except Exception as e:
        logger.warning("CLAHE falhou: %s", e)
        return img


def _sharpen(img: "np.ndarray") -> "np.ndarray":
    """Filtro de nitidez leve para texto."""
    if not HAS_OPENCV or img is None:
        return img
    try:
        kernel = np.array([[-0.5, -0.5, -0.5], [-0.5, 5.0, -0.5], [-0.5, -0.5, -0.5]])
        return cv2.filter2D(img, -1, kernel)
    except Exception:
        return img


def _denoise(img: "np.ndarray") -> "np.ndarray":
    """Reduz ruído mantendo bordas (documentos)."""
    if not HAS_OPENCV or img is None:
        return img
    try:
        return cv2.fastNlMeansDenoisingColored(img, None, 6, 6, 7, 21)
    except Exception as e:
        logger.warning("Denoise falhou: %s", e)
        return img


def _normalize_brightness(img: "np.ndarray") -> "np.ndarray":
    """Ajusta brilho quando a imagem está escura (documento escaneado), para melhor leitura pelo Gemini."""
    if not HAS_OPENCV or img is None:
        return img
    try:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        mean_val = float(cv2.mean(gray)[0])
        if mean_val >= 100:
            return img
        # Imagem escura: esticar contraste (0–255) preservando cores
        if len(img.shape) == 3:
            return cv2.normalize(img, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)
        return cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)
    except Exception as e:
        logger.warning("Normalize brightness falhou: %s", e)
        return img


def _resize_if_needed(img: "np.ndarray", max_side: int = MAX_SIZE) -> "np.ndarray":
    """Redimensiona só se o lado maior passar do limite; mantém proporção."""
    if not HAS_OPENCV or img is None:
        return img
    h, w = img.shape[:2]
    if max(h, w) <= max_side:
        return img
    if h >= w:
        new_h, new_w = max_side, int(w * max_side / h)
    else:
        new_w, new_h = max_side, int(h * max_side / w)
    return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)


def _otsu_threshold(gray: "np.ndarray") -> "np.ndarray":
    """Binarização por Otsu: remove sombras e fundo irregular (fotos de celular)."""
    if not HAS_OPENCV or gray is None:
        return gray
    try:
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return binary
    except Exception as e:
        logger.warning("Otsu falhou: %s", e)
        return gray


def _remove_table_lines(img_binary: "np.ndarray") -> "np.ndarray":
    """Morfologia: remove linhas de tabela (box removal) para o OCR não confundir | com 1 ou l."""
    if not HAS_OPENCV or img_binary is None:
        return img_binary
    try:
        # Kernel horizontal: remove linhas horizontais da tabela
        k_h = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
        # Kernel vertical: remove linhas verticais
        k_v = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))
        out = cv2.morphologyEx(img_binary, cv2.MORPH_OPEN, k_h)
        out = cv2.morphologyEx(out, cv2.MORPH_OPEN, k_v)
        return out
    except Exception as e:
        logger.warning("Remoção de linhas falhou: %s", e)
        return img_binary


def preprocess_tiss_enhance(image_path: str) -> Tuple[bytes, str]:
    """
    Pipeline para guia TISS quando OCR for usado (Tesseract etc.):
    Grayscale → Deskew → Otsu (adaptive threshold) → Box removal (linhas de tabela).
    Reduz falha por linhas de tabela e fontes pequenas. Para Gemini Vision use PREPROCESS_IMAGE=0 ou 1.
    """
    if not HAS_OPENCV:
        with open(image_path, "rb") as f:
            return f.read(), "image/jpeg"
    try:
        img = cv2.imread(image_path)
        if img is None:
            with open(image_path, "rb") as f:
                return f.read(), "image/jpeg"
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray = _deskew(gray)
        binary = _otsu_threshold(gray)
        binary = _remove_table_lines(binary)
        img = _resize_if_needed(binary, max_side=2048)
        if len(img.shape) == 2:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        return buf.tobytes(), "image/jpeg"
    except Exception as e:
        logger.warning("Pipeline TISS enhance falhou: %s", e)
        with open(image_path, "rb") as f:
            return f.read(), "image/jpeg"


def preprocess_for_vision(image_path: str) -> Tuple[bytes, str]:
    """
    Prepara a imagem para o Gemini Vision.
    Se PREPROCESS_IMAGE=0 ou false: envia a imagem quase original (só redimensiona se > 4096px).
    Assim o Gemini recebe o mesmo tipo de imagem que quando você cola no chat.
    Caso contrário: aplica deskew, denoise, contraste, nitidez e resize (pode alterar demais a imagem).
    """
    import os
    mode = os.environ.get("PREPROCESS_IMAGE", "0").strip().lower()
    if mode in ("0", "false", "no"):
        return _preprocess_minimal(image_path)
    if mode == "tiss":
        return preprocess_tiss_enhance(image_path)
    if not HAS_OPENCV:
        with open(image_path, "rb") as f:
            return f.read(), "image/jpeg"
    try:
        img = cv2.imread(image_path)
        if img is None:
            with open(image_path, "rb") as f:
                return f.read(), "image/jpeg"
        img = _deskew(img)
        img = _normalize_brightness(img)
        img = _denoise(img)
        img = _enhance_contrast(img)
        img = _sharpen(img)
        img = _resize_if_needed(img)
        encode_param = [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]
        _, buf = cv2.imencode(".jpg", img, encode_param)
        return buf.tobytes(), "image/jpeg"
    except Exception as e:
        logger.warning("Pré-processamento falhou: %s. Enviando original.", e)
        return _preprocess_minimal(image_path)


def _preprocess_minimal(image_path: str) -> Tuple[bytes, str]:
    """Envia a imagem o mais próxima do original: só redimensiona se passar do limite da API."""
    ext = (Path(image_path).suffix or "").lower()
    mime = "image/png" if ext == ".png" else "image/jpeg"
    if not HAS_OPENCV:
        with open(image_path, "rb") as f:
            return f.read(), mime
    try:
        img = cv2.imread(image_path)
        if img is None:
            with open(image_path, "rb") as f:
                return f.read(), mime
        h, w = img.shape[:2]
        max_side = 4096
        if max(h, w) <= max_side:
            with open(image_path, "rb") as f:
                return f.read(), mime
        if h >= w:
            new_h, new_w = max_side, int(w * max_side / h)
        else:
            new_w, new_h = max_side, int(h * max_side / w)
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
        _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        return buf.tobytes(), "image/jpeg"
    except Exception as e:
        logger.warning("Pré-processamento mínimo falhou: %s", e)
        with open(image_path, "rb") as f:
            return f.read(), mime
