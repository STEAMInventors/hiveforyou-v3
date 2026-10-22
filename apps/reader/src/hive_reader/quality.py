import re

IDENTITY_MIN_ALNUM = 40
LOW_PAGE_CHAR_THRESHOLD = 12

_ALNUM = re.compile(r"[A-Za-z0-9]")


def normalize_page_text(text: str) -> str:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in normalized.split("\n")]
    return "\n".join(lines).strip()


def alnum_count(text: str) -> int:
    return len(_ALNUM.findall(text))


def identity_text_sufficient(text: str) -> bool:
    return alnum_count(text) >= IDENTITY_MIN_ALNUM


def assess_page_quality(text: str) -> tuple[bool, list[str]]:
    issues: list[str] = []
    normalized = normalize_page_text(text)
    chars = len(normalized)
    if chars < LOW_PAGE_CHAR_THRESHOLD:
        issues.append("LOW_TEXT_DENSITY")
    sufficient = identity_text_sufficient(normalized)
    if not sufficient:
        issues.append("IDENTITY_TEXT_INSUFFICIENT")
    return sufficient, issues
