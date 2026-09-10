"""Logging setup for the agent (stdout + rotating file)."""

from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler


def setup_logger(name: str = "taxwork-agent", log_dir: str | None = None) -> logging.Logger:
    logger = logging.getLogger(name)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        stream = logging.StreamHandler()
        stream.setFormatter(fmt)
        logger.addHandler(stream)

    # main() calls this again with log_dir after import-time init attached
    # only the stdout handler — the file handler must still be attached,
    # otherwise pythonw runs (no console) leave zero logs behind.
    if log_dir and not any(isinstance(h, RotatingFileHandler) for h in logger.handlers):
        os.makedirs(log_dir, exist_ok=True)
        fh = RotatingFileHandler(
            os.path.join(log_dir, "agent.log"), maxBytes=1_000_000, backupCount=3, encoding="utf-8"
        )
        fh.setFormatter(fmt)
        logger.addHandler(fh)
    return logger
