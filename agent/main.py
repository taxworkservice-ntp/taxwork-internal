"""Taxwork Express Backup agent — poll -> claim -> zip -> sha256 -> upload -> report.

Read-only toward Express data: the source directory is only ever zipped.
Temp ZIPs live in %LOCALAPPDATA%\\TaxworkExpressBackup\\pending\\ and are
deleted after a confirmed upload; on failure they are kept for retry.
"""

from __future__ import annotations

import os
import sys
import time

from api import ApiClient, ApiError
from backup import BackupError, zip_directory
from checksum import sha256_file
from config import AgentConfig, default_paths, load_config
from logger import setup_logger
from storage import upload_file

PERMANENT_CODES = {"SOURCE_NOT_FOUND", "ACCESS_DENIED"}

log = setup_logger()


def run_job(client: ApiClient, cfg: AgentConfig, job_id: str, source_path: str, pending_dir: str) -> None:
    # TEST_SOURCE_PATH lets devs exercise the pipeline without touching real data.
    if cfg.test_source_path:
        log.info("TEST_SOURCE_PATH override active: %s", cfg.test_source_path)
        source_path = cfg.test_source_path

    zip_name = f"job-{job_id}.zip"
    zip_path = os.path.join(pending_dir, zip_name)

    try:
        job = client.claim(job_id)
    except ApiError as exc:
        log.info("claim %s: %s (%s)", job_id, exc.code, exc)
        return
    if job.source_path:
        source_path = job.source_path if not cfg.test_source_path else source_path

    try:
        log.info("backing up job %s from %s", job_id, source_path)
        result = zip_directory(source_path, zip_path)
        digest = sha256_file(zip_path)
        log.info("zipped %d files (%d bytes) sha256=%s", result.file_count, result.source_bytes, digest[:16])

        upload_url, storage_key = client.upload_url(job_id, zip_name)
        sent = upload_file(upload_url, zip_path)
        log.info("uploaded %d bytes -> %s", sent, storage_key)

        client.complete(
            job_id,
            checksum=digest,
            backup_size=sent,
            source_size=result.source_bytes,
            source_files=result.file_count,
            storage_key=storage_key,
        )
        log.info("job %s success", job_id)
        try:
            os.remove(zip_path)  # only after confirmed upload
        except OSError:
            pass
    except BackupError as exc:
        log.error("job %s failed: %s %s", job_id, exc.code, exc)
        client.fail(job_id, exc.code, str(exc))
        # Permanent errors: drop the temp file so a bad source never piles up.
        if exc.code in PERMANENT_CODES:
            try:
                if os.path.exists(zip_path):
                    os.remove(zip_path)
            except OSError:
                pass
    except ApiError as exc:
        log.error("job %s failed: %s %s", job_id, exc.code, exc)
        if exc.code not in PERMANENT_CODES:
            pass  # temp ZIP kept for retry; server lease reclaims the job
        client.fail(job_id, exc.code, str(exc))
    except Exception as exc:  # noqa: BLE001 - never crash the loop
        log.exception("job %s unexpected error: %s", job_id, exc)
        client.fail(job_id, "UNKNOWN_ERROR", str(exc)[:2000])


def register_interactive(cfg: AgentConfig) -> None:
    """First-run enrolment: paste the one-time token from the web UI."""
    import requests as _requests

    token = input("Registration token from Taxwork web (Express Backup > เพิ่มเครื่อง): ").strip()
    resp = _requests.post(
        f"{cfg.server_url}/api/express-backup/agent/register",
        json={"agentId": cfg.agent_id, "registrationToken": token, "version": cfg.version},
        timeout=30,
    )
    if resp.status_code != 200:
        sys.exit(f"registration failed ({resp.status_code}): {resp.text[:300]}")
    credential = resp.json()["credential"]
    _agent_id, secret = credential.split(".", 1)
    print("Registered. Save this secret into config.json as agent_secret:")
    print(secret)
    print("(The web UI never shows it again.)")


def main() -> None:
    if "--register" in sys.argv:
        # config.json needs server_url + agent_id only for this step.
        cfg = load_config()
        register_interactive(cfg)
        return

    cfg: AgentConfig = load_config()
    _cfg_path, pending_dir = default_paths()
    os.makedirs(pending_dir, exist_ok=True)
    log = setup_logger(log_dir=os.path.dirname(pending_dir))

    client = ApiClient(cfg.server_url, cfg.credential, cfg.version)
    log.info("agent %s starting (poll %ss, heartbeat %ss)", cfg.agent_id, cfg.poll_interval, cfg.heartbeat_interval)

    last_heartbeat = 0.0
    while True:
        try:
            if time.time() - last_heartbeat >= cfg.heartbeat_interval:
                try:
                    client.heartbeat()
                    last_heartbeat = time.time()
                except ApiError as exc:
                    log.warning("heartbeat failed: %s", exc)
            for job in client.list_jobs():
                run_job(client, cfg, job.id, job.source_path, pending_dir)
        except ApiError as exc:
            log.warning("poll cycle failed: %s %s", exc.code, exc)
        except Exception as exc:  # noqa: BLE001 - never crash the loop
            log.exception("poll cycle error: %s", exc)
        time.sleep(cfg.poll_interval)


if __name__ == "__main__":
    main()
