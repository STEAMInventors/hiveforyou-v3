import hashlib
import json


def compute_read_fingerprint(
    source_sha256: str,
    options: dict | None,
    contract_version: str = "reader-document-read@1",
) -> str:
    payload = {
        "contract_version": contract_version,
        "source_sha256": source_sha256.lower(),
        "options": options or {},
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
