import pytest

from hive_reader.pipeline.docx_render_v1 import extract_docx_pages
from hive_reader.pipeline.router import ExtractionError, extract_document_bytes


def test_pdf_native_multi_page(sample_pdf_bytes: bytes) -> None:
    pages, model_calls, _tools = extract_document_bytes(
        sample_pdf_bytes,
        "application/pdf",
        max_pages=10,
        ocr_mode="never",
        docx_page_break_strategy="reproducible_v1",
    )
    assert len(pages) == 2
    assert pages[0].extraction_method == "pdf_native"
    assert pages[0].page_number == 1
    assert "HiveForYou" in pages[0].text
    assert model_calls == []


def test_docx_reproducible_stable(
    sample_docx_bytes: bytes,
    libreoffice_unpinned: None,
) -> None:
    first, _ = extract_docx_pages(sample_docx_bytes, max_pages=10, ocr_mode="never")
    second, _ = extract_docx_pages(sample_docx_bytes, max_pages=10, ocr_mode="never")
    assert len(first) == len(second)
    assert [page.text for page in first] == [page.text for page in second]
    assert first[0].extraction_method == "docx_render_v1"


def test_docx_libreoffice_page_count(
    sample_docx_two_pages_bytes: bytes,
    libreoffice_unpinned: None,
) -> None:
    pages, model_calls = extract_docx_pages(
        sample_docx_two_pages_bytes,
        max_pages=10,
        ocr_mode="never",
    )
    assert len(pages) == 2
    assert pages[0].page_number == 1
    assert pages[1].page_number == 2
    assert "page one" in pages[0].text.lower()
    assert "page two" in pages[1].text.lower()
    assert all(page.extraction_method == "docx_render_v1" for page in pages)
    assert model_calls == []


def test_unsupported_mime_raises() -> None:
    with pytest.raises(ExtractionError) as exc:
        extract_document_bytes(
            b"not-a-doc",
            "application/zip",
            max_pages=1,
            ocr_mode="never",
            docx_page_break_strategy="reproducible_v1",
        )
    assert exc.value.code == "INVALID_REQUEST"
