"""Taxwork Express Backup agent configuration.

Secrets live ONLY in the local config.json (never in git).
See config.example.json for the shape.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class AgentConfig:
    server_url: str  # e.g. https://internal.taxworkaccount.com
    agent_id: str
    agent_secret: str  # long-lived credential from registration
    poll_interval: int = 30
    heartbeat_interval: int = 60
    version: str = "1.0.0"
    test_source_path: str | None = None  # dev override; never real Express data

    @property
    def credential(self) -> str:
        return f"{self.agent_id}.{self.agent_secret}"


def default_paths() -> tuple[str, str]:
    """(config_path, pending_dir) under %LOCALAPPDATA% (or ~/.taxwork on dev)."""
    base = os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), ".taxwork")
    root = os.path.join(base, "TaxworkExpressBackup")
    return os.path.join(root, "config.json"), os.path.join(root, "pending")


def load_config(path: str | None = None) -> AgentConfig:
    cfg_path = path or os.environ.get("TAXWORK_AGENT_CONFIG") or default_paths()[0]
    with open(cfg_path, encoding="utf-8") as f:
        raw = json.load(f)
    for key in ("server_url", "agent_id", "agent_secret"):
        if not raw.get(key):
            raise SystemExit(f"config {cfg_path} is missing {key!r}")
    return AgentConfig(
        server_url=str(raw["server_url"]).rstrip("/"),
        agent_id=str(raw["agent_id"]),
        agent_secret=str(raw["agent_secret"]),
        poll_interval=int(raw.get("poll_interval", 30)),
        heartbeat_interval=int(raw.get("heartbeat_interval", 60)),
        version=str(raw.get("version", "1.0.0")),
        test_source_path=raw.get("test_source_path"),
    )
