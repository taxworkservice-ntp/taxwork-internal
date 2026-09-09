"""Direct PUT of the backup ZIP to the server-minted presigned R2 URL."""

from __future__ import annotations

import os
import time

import requests

from api import RETRY_WAITS, ApiError

_CHUNK = 4 * 1024 * 1024


def upload_file(url: str, path: str) -> int:
    """PUT path -> presigned URL with retries. Returns bytes sent."""
    size = os.path.getsize(path)
    last: Exception | None = None
    for attempt in range(len(RETRY_WAITS) + 1):
        try:
            with open(path, "rb") as f:
                resp = requests.put(
                    url,
                    data=_reader(f),
                    headers={"Content-Type": "application/zip", "Content-Length": str(size)},
                    timeout=600,
                )
            if 200 <= resp.status_code < 300:
                return size
            last = RuntimeError(f"HTTP {resp.status_code}: {resp.text[:500]}")
        except requests.RequestException as exc:
            last = exc
        if attempt < len(RETRY_WAITS):
            time.sleep(RETRY_WAITS[attempt])
    raise ApiError("UPLOAD_FAILED", f"upload failed after retries: {last}")


def _reader(f):
    while True:
        chunk = f.read(_CHUNK)
        if not chunk:
            break
        yield chunk
