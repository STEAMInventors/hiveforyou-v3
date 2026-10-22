from hive_reader.fingerprint import compute_read_fingerprint
from hive_reader.quality import identity_text_sufficient, normalize_page_text


def test_normalize_page_text() -> None:
    assert normalize_page_text("a\r\nb\r c") == "a\nb\n c"


def test_identity_threshold() -> None:
    short = "abc"
    long = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMN"
    assert not identity_text_sufficient(short)
    assert identity_text_sufficient(long)


def test_read_fingerprint_stable() -> None:
    first = compute_read_fingerprint("aa" * 32, {"ocr_mode": "selective"})
    second = compute_read_fingerprint("aa" * 32, {"ocr_mode": "selective"})
    assert first == second
    third = compute_read_fingerprint("bb" * 32, {"ocr_mode": "selective"})
    assert first != third
