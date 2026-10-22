from hive_reader import __version__
from hive_reader.config import settings
from hive_reader.fingerprint import compute_read_fingerprint
from hive_reader.models import (
    ReaderModelCallProvenance,
    ReaderReadDocumentProvenance,
    ReaderReadDocumentRequest,
    ReaderReadDocumentResponse,
)
from hive_reader.pipeline.router import ExtractionError, extract_document_bytes
from hive_reader.storage import (
    StorageError,
    assert_storage_path_allowed,
    download_storage_object,
    verify_sha256,
)


async def read_document(
    request: ReaderReadDocumentRequest,
    *,
    content_override: bytes | None = None,
) -> ReaderReadDocumentResponse:
    if request.extraction_schema is not None:
        raise ExtractionError(
            "INVALID_REQUEST",
            "Schema-driven extraction is not supported in P2.1.",
        )

    options = request.options
    max_pages = (options.max_pages if options else None) or settings.max_pages_default
    ocr_mode = options.ocr_mode if options else "selective"
    docx_strategy = (
        options.docx_page_break_strategy if options else "reproducible_v1"
    )

    assert_storage_path_allowed(
        request.source.storage_path,
        request.source.owner_user_id,
        request.source.hive_id,
    )

    if content_override is not None:
        content = content_override
    else:
        content = await download_storage_object(
            request.source.storage_bucket,
            request.source.storage_path,
        )

    if len(content) != request.source.byte_size:
        raise ExtractionError("INVALID_REQUEST", "Downloaded size does not match source.")

    hash_ok = verify_sha256(content, request.source.sha256)
    if not hash_ok:
        raise ExtractionError("INVALID_REQUEST", "Downloaded content hash does not match.")

    pages, model_calls, tools = extract_document_bytes(
        content,
        request.source.mime_type,
        max_pages=max_pages,
        ocr_mode=ocr_mode,
        docx_page_break_strategy=docx_strategy,
    )

    fingerprint = compute_read_fingerprint(
        request.source.sha256,
        options.model_dump(exclude_none=True) if options else None,
    )

    provenance = ReaderReadDocumentProvenance(
        reader_git_sha=settings.git_sha,
        reader_version=__version__,
        tools=tools,
        model_calls=[ReaderModelCallProvenance(**call) for call in model_calls],
    )

    return ReaderReadDocumentResponse(
        contract_version="reader-document-read@1",
        status="SUCCEEDED",
        source=request.source,
        source_hash_verified=True,
        page_count=len(pages),
        pages=pages,
        provenance=provenance,
        read_fingerprint=fingerprint,
    )
