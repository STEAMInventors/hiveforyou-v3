from hive_reader.models import ReaderPageQuality, ReaderReadDocumentPage
from hive_reader.pipeline.ocr_local import ocr_image_bytes
from hive_reader.pipeline.ocr_litellm import ocr_via_litellm
from hive_reader.quality import assess_page_quality


def extract_image_pages(
    image_bytes: bytes,
    *,
    ocr_mode: str,
) -> tuple[list[ReaderReadDocumentPage], list[dict]]:
    model_calls: list[dict] = []
    text, issues = ocr_image_bytes(image_bytes)
    method = "image_ocr_local"

    sufficient, quality_issues = assess_page_quality(text)
    all_issues = list(dict.fromkeys([*issues, *quality_issues]))

    if (ocr_mode == "always" or not sufficient) and ocr_mode != "never":
        llm_text, prov, llm_issues = ocr_via_litellm(image_bytes, 1)
        all_issues.extend(llm_issues)
        if prov:
            model_calls.append(prov)
        if llm_text:
            text = llm_text
            method = "image_ocr_litellm"
            sufficient, quality_issues = assess_page_quality(text)
            all_issues = list(dict.fromkeys([*all_issues, *quality_issues]))

    page = ReaderReadDocumentPage(
        page_number=1,
        text=text,
        extraction_method=method,  # type: ignore[arg-type]
        quality=ReaderPageQuality(
            character_count=len(text),
            identity_text_sufficient=sufficient,
            issues=all_issues,
        ),
    )
    return [page], model_calls
