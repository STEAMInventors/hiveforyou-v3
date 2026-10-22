import asyncio

from hive_reader.models import ReaderReadDocumentOptions, ReaderReadDocumentRequest, ReaderReadDocumentSource
from hive_reader.service import read_document


def test_read_document_with_inline_bytes(sample_pdf_bytes: bytes, sample_pdf_sha256: str) -> None:
    source = ReaderReadDocumentSource(
        source_document_id="11111111-1111-1111-1111-111111111111",
        hive_id="22222222-2222-2222-2222-222222222222",
        owner_user_id="33333333-3333-3333-3333-333333333333",
        storage_bucket="hive3-source-documents",
        storage_path="33333333-3333-3333-3333-333333333333/22222222-2222-2222-2222-222222222222/x/sample.pdf",
        mime_type="application/pdf",
        byte_size=len(sample_pdf_bytes),
        sha256=sample_pdf_sha256,
        filename="sample.pdf",
    )
    request = ReaderReadDocumentRequest(
        contract_version="reader-document-read@1",
        source=source,
        options=ReaderReadDocumentOptions(ocr_mode="never"),
    )
    result = asyncio.run(read_document(request, content_override=sample_pdf_bytes))
    assert result.status == "SUCCEEDED"
    assert result.page_count == 2
    assert result.source_hash_verified is True
    assert result.read_fingerprint
