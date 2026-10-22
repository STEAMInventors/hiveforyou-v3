from hive_reader import __version__
from hive_reader.models import ReaderReadDocumentPage
from hive_reader.pipeline.docx_render_v1 import extract_docx_pages
from hive_reader.pipeline.image import extract_image_pages
from hive_reader.pipeline.pdf_native import extract_pdf_pages

PDF_MIME = "application/pdf"
PNG_MIME = "image/png"
JPEG_MIMES = {"image/jpeg", "image/jpg"}
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class ExtractionError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _tool_versions() -> dict[str, str]:
    import importlib.metadata

    from hive_reader.pipeline.libreoffice_render import (
        LibreOfficeRenderError,
        libreoffice_version,
        resolve_libreoffice_binary,
    )

    tools: dict[str, str] = {"hive_reader": __version__}
    for package in ("pymupdf",):
        try:
            tools[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            continue
    try:
        binary = resolve_libreoffice_binary()
        tools["libreoffice"] = libreoffice_version(binary)
    except LibreOfficeRenderError:
        tools["libreoffice"] = "unavailable"
    return tools


def extract_document_bytes(
    content: bytes,
    mime_type: str,
    *,
    max_pages: int,
    ocr_mode: str,
    docx_page_break_strategy: str,
) -> tuple[list[ReaderReadDocumentPage], list[dict], dict[str, str]]:
    mime = mime_type.strip().lower()
    model_calls: list[dict] = []

    if mime == PDF_MIME:
        try:
            pages, model_calls = extract_pdf_pages(
                content, max_pages=max_pages, ocr_mode=ocr_mode
            )
        except Exception as exc:
            raise ExtractionError("EXTRACTION_FAILED", "Could not read PDF document.") from exc
    elif mime in JPEG_MIMES or mime == PNG_MIME:
        pages, model_calls = extract_image_pages(content, ocr_mode=ocr_mode)
    elif mime == DOCX_MIME:
        if docx_page_break_strategy != "reproducible_v1":
            raise ExtractionError("INVALID_REQUEST", "Unsupported DOCX page break strategy.")
        try:
            pages, docx_model_calls = extract_docx_pages(
                content,
                max_pages=max_pages,
                ocr_mode=ocr_mode,
            )
            model_calls.extend(docx_model_calls)
        except Exception as exc:
            raise ExtractionError("EXTRACTION_FAILED", "Could not read DOCX document.") from exc
    else:
        raise ExtractionError("INVALID_REQUEST", "Unsupported document type.")

    return pages, model_calls, _tool_versions()
