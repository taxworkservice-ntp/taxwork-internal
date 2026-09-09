"""HTTPS client for the Taxwork Express Backup API.

The agent holds ONLY its own credential (agentId.agentSecret).
It never sees R2 secrets, DATABASE_URL, or other clients' data —
uploads go through server-minted presigned URLs.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import requests

RETRY_WAITS = (30, 120, 300)  # network/upload retries only


class ApiError(Exception):
    def __init__(self, code: str, message: str, status: int = 0) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


@dataclass
class Job:
    id: str
    client_id: str
    source_path: str
    retention_days: int = 30


class ApiClient:
    def __init__(self, server_url: str, credential: str, version: str, timeout: int = 30) -> None:
        self.base = server_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {credential}"})
        self.version = version
        self.timeout = timeout

    # -- low level -----------------------------------------------------
    def _request(self, method: str, path: str, **kwargs) -> requests.Response:
        last: Exception | None = None
        for attempt in range(len(RETRY_WAITS) + 1):
            try:
                resp = self.session.request(method, self.base + path, timeout=self.timeout, **kwargs)
                if resp.status_code in (401, 403):
                    raise ApiError("AUTH_FAILED", f"auth rejected ({resp.status_code})", resp.status_code)
                return resp
            except ApiError:
                raise
            except requests.RequestException as exc:
                last = exc
                if attempt < len(RETRY_WAITS):
                    time.sleep(RETRY_WAITS[attempt])
        raise ApiError("NETWORK_ERROR", f"network failed: {last}")

    # -- agent endpoints ------------------------------------------------
    def heartbeat(self) -> None:
        resp = self._request("POST", "/api/express-backup/agent/heartbeat", json={"version": self.version})
        if resp.status_code != 200:
            raise ApiError("NETWORK_ERROR", f"heartbeat failed: {resp.status_code}", resp.status_code)

    def list_jobs(self) -> list[Job]:
        resp = self._request("GET", "/api/express-backup/agent/jobs")
        if resp.status_code != 200:
            raise ApiError("NETWORK_ERROR", f"list jobs failed: {resp.status_code}", resp.status_code)
        jobs = []
        for j in resp.json().get("jobs", []):
            jobs.append(
                Job(
                    id=j["id"],
                    client_id=j["clientId"],
                    source_path=j["sourcePath"],
                    retention_days=int(j.get("retentionDays", 30)),
                )
            )
        return jobs

    def claim(self, job_id: str) -> Job:
        resp = self._request("POST", f"/api/express-backup/agent/jobs/{job_id}/claim")
        if resp.status_code == 409:
            raise ApiError("JOB_EXPIRED", "job already claimed")
        if resp.status_code != 200:
            raise ApiError("NETWORK_ERROR", f"claim failed: {resp.status_code}", resp.status_code)
        j = resp.json()
        return Job(
            id=j["id"],
            client_id=j["clientId"],
            source_path=j["sourcePath"],
            retention_days=int(j.get("retentionDays", 30)),
        )

    def upload_url(self, job_id: str, file_name: str) -> tuple[str, str]:
        resp = self._request(
            "POST", f"/api/express-backup/agent/jobs/{job_id}/upload-url", json={"fileName": file_name}
        )
        if resp.status_code != 200:
            raise ApiError("NETWORK_ERROR", f"upload-url failed: {resp.status_code}", resp.status_code)
        data = resp.json()
        return data["url"], data["storageKey"]

    def complete(
        self,
        job_id: str,
        *,
        checksum: str,
        backup_size: int,
        source_size: int,
        source_files: int,
        storage_key: str,
    ) -> None:
        resp = self._request(
            "POST",
            f"/api/express-backup/agent/jobs/{job_id}/complete",
            json={
                "checksum": checksum,
                "backupSizeBytes": backup_size,
                "sourceSizeBytes": source_size,
                "sourceFileCount": source_files,
                "storageKey": storage_key,
            },
        )
        if resp.status_code != 200:
            raise ApiError("NETWORK_ERROR", f"complete failed: {resp.status_code}", resp.status_code)

    def fail(self, job_id: str, code: str, message: str) -> None:
        try:
            self._request(
                "POST",
                f"/api/express-backup/agent/jobs/{job_id}/fail",
                json={"errorCode": code, "errorMessage": message[:2000]},
            )
        except ApiError:
            pass  # best effort — the job lease/reclaim covers a lost failure report
