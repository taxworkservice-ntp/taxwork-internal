"""Restore (export) mechanics: download -> verify -> stage -> .bak -> place.

Two human gates enforced server-side (approve, confirm). This module only does
mechanical work and NEVER touches live data unless the restore is confirmed:
  approved  -> download ZIP, SHA-256 verify, extract to staging, report staged
  confirmed -> .bak copy of existing target, merge staged files in, report done

Placement is merge-only (nothing in the target is ever deleted) and idempotent:
the .bak path is deterministic per restore, so a retried run reuses it instead
of stacking backups. Staging survives restarts; it is cleaned after completion.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import time
import zipfile
from dataclasses import dataclass

import requests

from api import RETRY_WAITS, ApiError


@dataclass
class StageResult:
    zip_path: str
    staged_dir: str
    file_count: int
    download_bytes: int


class RestoreError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def staging_paths(staging_root: str, restore_id: str) -> tuple[str, str]:
    """(zip_path, extracted_dir) for one restore. Deterministic for idempotency."""
    short = restore_id.replace("-", "")[:8]
    root = os.path.join(staging_root, f"restore-{short}")
    return os.path.join(root, "download.zip"), os.path.join(root, "extracted")


def download_file(url: str, dest_zip: str, expected_bytes: int | None = None) -> int:
    """Stream GET url -> dest_zip with retries. Returns bytes written."""
    os.makedirs(os.path.dirname(dest_zip), exist_ok=True)
    last: Exception | None = None
    for attempt in range(len(RETRY_WAITS) + 1):
        try:
            with requests.get(url, stream=True, timeout=60) as resp:
                if not 200 <= resp.status_code < 300:
                    last = RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
                else:
                    total = 0
                    with open(dest_zip, "wb") as f:
                        for chunk in resp.iter_content(chunk_size=1024 * 1024):
                            if chunk:
                                f.write(chunk)
                                total += len(chunk)
                    if expected_bytes and total != expected_bytes:
                        last = RuntimeError(f"size mismatch: got {total}, want {expected_bytes}")
                    else:
                        return total
        except requests.RequestException as exc:
            last = exc
        if attempt < len(RETRY_WAITS):
            time.sleep(RETRY_WAITS[attempt])
    raise RestoreError("DOWNLOAD_FAILED", f"download failed after retries: {last}")


def verify_sha256(path: str, expected: str | None) -> str:
    """SHA-256 of path; raises CHECKSUM_MISMATCH when an expectation exists and differs."""
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    actual = digest.hexdigest()
    if expected and actual.lower() != expected.lower():
        raise RestoreError(
            "CHECKSUM_MISMATCH",
            f"downloaded file failed verification (actual {actual[:16]}…); "
            "stopping — never place an unverified archive",
        )
    return actual


def extract_zip(zip_path: str, dest_dir: str) -> int:
    """Extract into dest_dir with zip-slip protection. Returns file count."""
    try:
        with zipfile.ZipFile(zip_path) as zf:
            for member in zf.infolist():
                target = os.path.realpath(os.path.join(dest_dir, member.filename))
                if not target.startswith(os.path.realpath(dest_dir) + os.sep):
                    raise RestoreError("EXTRACT_FAILED", f"unsafe archive entry: {member.filename}")
            zf.extractall(dest_dir)
    except RestoreError:
        raise
    except Exception as exc:
        raise RestoreError("EXTRACT_FAILED", f"extract failed: {exc}") from exc
    count = 0
    for _root, _dirs, files in os.walk(dest_dir):
        count += len(files)
    return count


def fetch_and_stage(
    url: str,
    staging_root: str,
    restore_id: str,
    expected_checksum: str | None,
    expected_bytes: int | None = None,
) -> StageResult:
    """Full fetch phase. Skips re-download when a verified archive is staged."""
    zip_path, staged_dir = staging_paths(staging_root, restore_id)
    if os.path.exists(zip_path) and os.path.isdir(staged_dir):
        try:
            verify_sha256(zip_path, expected_checksum)
            count = sum(len(files) for _r, _d, files in os.walk(staged_dir))
            return StageResult(zip_path, staged_dir, count, os.path.getsize(zip_path))
        except RestoreError:
            pass  # stale staging — re-fetch below
    size = download_file(url, zip_path, expected_bytes)
    verify_sha256(zip_path, expected_checksum)
    if os.path.isdir(staged_dir):
        shutil.rmtree(staged_dir, ignore_errors=True)
    os.makedirs(staged_dir, exist_ok=True)
    count = extract_zip(zip_path, staged_dir)
    return StageResult(zip_path, staged_dir, count, size)


def bak_path_for(target_path: str, restore_id: str) -> str:
    short = restore_id.replace("-", "")[:8]
    return f"{target_path.rstrip(os.sep)}.bak-{short}"


def place_staged(staged_dir: str, target_path: str, restore_id: str) -> str:
    """Rollback copy then merge staged files in. Returns the .bak path (or '')."""
    if not os.path.isdir(staged_dir):
        raise RestoreError("STAGE_MISSING", "staged files are gone; re-fetch required")
    bak = ""
    if os.path.exists(target_path):
        if not os.path.isdir(target_path):
            raise RestoreError("TARGET_INVALID", f"target exists and is not a directory: {target_path}")
        bak = bak_path_for(target_path, restore_id)
        if not os.path.exists(bak):
            try:
                shutil.copytree(target_path, bak)
            except OSError as exc:
                raise RestoreError("BAK_FAILED", f"cannot back up existing target: {exc}") from exc
    else:
        try:
            os.makedirs(target_path, exist_ok=True)
        except OSError as exc:
            raise RestoreError("TARGET_INVALID", f"cannot create target: {exc}") from exc
    try:
        shutil.copytree(staged_dir, target_path, dirs_exist_ok=True)
    except OSError as exc:
        raise RestoreError("PLACE_FAILED", f"cannot place files: {exc}") from exc
    return bak


def cleanup_staging(staging_root: str, restore_id: str) -> None:
    short = restore_id.replace("-", "")[:8]
    shutil.rmtree(os.path.join(staging_root, f"restore-{short}"), ignore_errors=True)
