"""SHA-256 helper (streamed, works for multi-GB zips)."""

from __future__ import annotations

import hashlib

_CHUNK = 1024 * 1024


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(_CHUNK)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()
