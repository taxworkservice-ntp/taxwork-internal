"""Backup strategies. V1: ZIP the configured source directory read-only.

The source directory is NEVER modified. If Express later gets an official
backup procedure, add a new strategy here without touching auth/job/R2 code.
"""

from __future__ import annotations

import os
import shutil
import zipfile
from dataclasses import dataclass


@dataclass
class BackupResult:
    zip_path: str
    file_count: int
    source_bytes: int


class BackupError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _disk_free(path: str) -> int:
    probe = path if os.path.isdir(path) else os.path.dirname(path) or "."
    return shutil.disk_usage(probe).free


def zip_directory(source_path: str, dest_zip: str) -> BackupResult:
    """Read-only archive of source_path -> dest_zip. Raises BackupError."""
    if not os.path.exists(source_path):
        raise BackupError("SOURCE_NOT_FOUND", f"source path not found: {source_path}")
    if not os.path.isdir(source_path):
        raise BackupError("SOURCE_NOT_FOUND", f"source path is not a directory: {source_path}")
    if not os.access(source_path, os.R_OK):
        raise BackupError("ACCESS_DENIED", f"cannot read source path: {source_path}")

    # Measure first so we can fail early on disk space (need ~2x in the worst case).
    total = 0
    count = 0
    try:
        for root, _dirs, files in os.walk(source_path):
            for name in files:
                fp = os.path.join(root, name)
                try:
                    total += os.path.getsize(fp)
                    count += 1
                except OSError as exc:
                    raise BackupError("ACCESS_DENIED", f"cannot stat {fp}: {exc}") from exc
    except BackupError:
        raise
    except OSError as exc:
        raise BackupError("ACCESS_DENIED", f"cannot enumerate {source_path}: {exc}") from exc

    pending_dir = os.path.dirname(dest_zip)
    if _disk_free(pending_dir) < total + (64 * 1024 * 1024):
        raise BackupError(
            "DISK_FULL",
            f"not enough temp disk space (need ~{total} bytes + headroom)",
        )

    os.makedirs(pending_dir, exist_ok=True)
    try:
        with zipfile.ZipFile(dest_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            for root, _dirs, files in os.walk(source_path):
                for name in files:
                    fp = os.path.join(root, name)
                    arc = os.path.relpath(fp, source_path)
                    try:
                        zf.write(fp, arc)
                    except OSError as exc:
                        raise BackupError("ARCHIVE_FAILED", f"cannot archive {fp}: {exc}") from exc
    except BackupError:
        raise
    except Exception as exc:  # noqa: BLE001 - map to explicit code
        raise BackupError("ARCHIVE_FAILED", f"zip failed: {exc}") from exc

    return BackupResult(zip_path=dest_zip, file_count=count, source_bytes=total)
