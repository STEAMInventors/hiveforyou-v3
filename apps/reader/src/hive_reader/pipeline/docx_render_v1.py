from hive_reader.models import ReaderReadDocumentPage
from hive_reader.pipeline.libreoffice_render import render_docx_to_pdf
from hive_reader.pipeline.pdf_native import extract_pdf_pages


def extract_docx_pages(
    docx_bytes: bytes,
    *,
    max_pages: int,
    ocr_mode: str,
) -> tuple[list[ReaderReadDocumentPage], list[dict]]:
    pdf_bytes = render_docx_to_pdf(docx_bytes)
    pages, model_calls = extract_pdf_pages(
        pdf_bytes,
        max_pages=max_pages,
        ocr_mode=ocr_mode,
    )

    docx_pages: list[ReaderReadDocumentPage] = []
    for page in pages:
        docx_pages.append(
            page.model_copy(update={"extraction_method": "docx_render_v1"})
        )
    return docx_pages, model_calls
