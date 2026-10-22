import fitz

from hive_reader.models import ReaderPageQuality, ReaderReadDocumentPage
from hive_reader.pipeline.ocr_local import ocr_image_bytes
from hive_reader.pipeline.ocr_litellm import ocr_via_litellm
from hive_reader.quality import assess_page_quality, normalize_page_text


def _page_needs_ocr(text: str, ocr_mode: str) -> bool:
    if ocr_mode == "never":
        return False
    if ocr_mode == "always":
        return True
    sufficient, _ = assess_page_quality(text)
    return not sufficient


def extract_pdf_pages(
    pdf_bytes: bytes,
    *,
    max_pages: int,
    ocr_mode: str,
) -> tuple[list[ReaderReadDocumentPage], list[dict]]:
    model_calls: list[dict] = []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages: list[ReaderReadDocumentPage] = []
    try:
        page_limit = min(doc.page_count, max_pages)
        for index in range(page_limit):
            page_number = index + 1
            page = doc.load_page(index)
            native = normalize_page_text(page.get_text("text"))
            method = "pdf_native"
            text = native
            extra_issues: list[str] = []

            if _page_needs_ocr(native, ocr_mode):
                pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                png_bytes = pixmap.tobytes("png")
                ocr_text, ocr_issues = ocr_image_bytes(png_bytes)
                extra_issues.extend(ocr_issues)
                if ocr_text and assess_page_quality(ocr_text)[0]:
                    text = ocr_text
                    method = "image_ocr_local"
                elif ocr_mode != "never":
                    llm_text, prov, llm_issues = ocr_via_litellm(png_bytes, page_number)
                    extra_issues.extend(llm_issues)
                    if prov:
                        model_calls.append(prov)
                    if llm_text:
                        text = llm_text
                        method = "image_ocr_litellm"

            sufficient, issues = assess_page_quality(text)
            issues = list(dict.fromkeys([*issues, *extra_issues]))
            pages.append(
                ReaderReadDocumentPage(
                    page_number=page_number,
                    text=text,
                    extraction_method=method,  # type: ignore[arg-type]
                    quality=ReaderPageQuality(
                        character_count=len(text),
                        identity_text_sufficient=sufficient,
                        issues=issues,
                    ),
                )
            )
        return pages, model_calls
    finally:
        doc.close()
