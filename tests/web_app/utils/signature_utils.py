from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any


def _normalized_headers(headers: dict[str, str]) -> dict[str, str]:
    keep = ["Content-Type", "User-Agent", "Accept"]
    return {key: headers[key] for key in keep if key in headers}


def build_request_signature(
    path: str,
    method: str,
    payload: dict[str, Any],
    headers: dict[str, str],
) -> dict[str, object]:
    canonical_payload = json.dumps(payload, sort_keys=True)
    payload_hash = hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()

    request_fingerprint = hashlib.md5(f"{method}:{path}:{payload_hash}".encode("utf-8")).hexdigest()

    payload_shape = {key: type(value).__name__ for key, value in payload.items()}

    return {
        "method": method,
        "path": path,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload_hash": payload_hash,
        "fingerprint": request_fingerprint,
        "payload_shape": payload_shape,
        "headers": _normalized_headers(headers),
    }
