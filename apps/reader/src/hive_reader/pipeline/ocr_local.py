from io import BytesIO

from PIL import Image

from hive_reader.quality import normalize_page_text


def tesseract_available() -> bool:
    try:
        import pytesseract  # noqa: F401

        return True
    except ImportError:
        return False


def ocr_image_bytes(image_bytes: bytes) -> tuple[str, list[str]]:
    issues: list[str] = []
    if not tesseract_available():
        issues.append("OCR_LOCAL_UNAVAILABLE")
        return "", issues
    try:
        import pytesseract

        image = Image.open(BytesIO(image_bytes))
        text = pytesseract.image_to_string(image)
        return normalize_page_text(text), issues
    except Exception:
        issues.append("OCR_LOCAL_FAILED")
        return "", issues
