"""Single-EXE first-run wizard: paste 2 codes -> registered -> auto-start.

No Python/CLI/JSON knowledge needed. Tkinter only (stdlib).
Called from main.py when config is missing or agent_secret is empty.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

DEFAULT_SERVER = "https://internal.taxworkaccount.com"

try:
    from config import default_paths
except ImportError:  # frozen exe layout edge
    from agent.config import default_paths  # type: ignore[no-redef]


def save_config(server_url: str, agent_id: str, secret: str) -> str:
    cfg_path, _ = default_paths()
    os.makedirs(os.path.dirname(cfg_path), exist_ok=True)
    data = {
        "server_url": server_url.rstrip("/"),
        "agent_id": agent_id.strip(),
        "agent_secret": secret,
        "poll_interval": 30,
        "heartbeat_interval": 60,
        "version": "1.0.0",
    }
    # Preserve existing test_source_path if present (dev machines).
    try:
        with open(cfg_path, encoding="utf-8") as f:
            old = json.load(f)
        if old.get("test_source_path"):
            data["test_source_path"] = old["test_source_path"]
    except (OSError, ValueError):
        pass
    with open(cfg_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    try:
        # Lock down secret on Windows (current user only). Best effort.
        if os.name == "nt":
            subprocess.run(
                ["icacls", cfg_path, "/inheritance:r", "/grant:r", f"{os.environ.get('USERNAME', '')}:F"],
                capture_output=True,
                timeout=15,
            )
    except Exception:
        pass
    return cfg_path


def do_register(server_url: str, agent_id: str, token: str, version: str = "1.0.0") -> str:
    import requests as _requests

    resp = _requests.post(
        f"{server_url.rstrip('/')}/api/express-backup/agent/register",
        json={"agentId": agent_id.strip(), "registrationToken": token.strip(), "version": version},
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"ลงทะเบียนไม่สำเร็จ ({resp.status_code}): {resp.text[:200]}")
    credential = resp.json()["credential"]
    _, secret = credential.split(".", 1)
    return secret


def ensure_startup(exe_path: str | None = None) -> bool:
    """Create ONLOGON Task Scheduler entry (admin). Returns True if created."""
    if os.name != "nt":
        return False
    exe = exe_path or sys.executable
    # Frozen PyInstaller exe: sys.executable is the agent itself. Dev: use pythonw + main.py.
    if exe.lower().endswith(("python.exe", "pythonw.exe")):
        base = os.path.dirname(os.path.abspath(__file__))
        cmd = f'"{exe.replace("python.exe", "pythonw.exe")}" "{os.path.join(base, "main.py")}"'
    else:
        cmd = f'"{exe}"'
    try:
        r = subprocess.run(
            [
                "schtasks", "/Create", "/TN", "TaxworkExpressBackup",
                "/TR", cmd, "/SC", "ONLOGON", "/RL", "HIGHEST", "/F",
            ],
            capture_output=True, text=True, timeout=30,
        )
        return r.returncode == 0
    except Exception:
        return False


def run_wizard(initial_server: str = DEFAULT_SERVER, initial_agent: str = "") -> bool:
    """Blocking GUI. Returns True when registered (config written)."""
    import tkinter as tk
    from tkinter import messagebox

    ok = {"value": False}

    root = tk.Tk()
    root.title("Taxwork Express Backup — ลงทะเบียนเครื่อง")
    root.resizable(False, False)

    tk.Label(root, text="1. เปิดเว็บ Express Backup → เพิ่มเครื่อง", font=("Segoe UI", 10, "bold")).pack(padx=16, pady=(14, 2), anchor="w")
    tk.Label(root, text="2. วาง 2 รหัสข้างล่างแล้วกดปุ่ม", font=("Segoe UI", 10)).pack(padx=16, anchor="w")

    frame = tk.Frame(root)
    frame.pack(padx=16, pady=10, fill="x")

    tk.Label(frame, text="เซิร์ฟเวอร์").grid(row=0, column=0, sticky="w", pady=2)
    server_var = tk.StringVar(value=initial_server)
    tk.Entry(frame, textvariable=server_var, width=46).grid(row=0, column=1, pady=2)

    tk.Label(frame, text="รหัสเครื่อง (agent ID)").grid(row=1, column=0, sticky="w", pady=2)
    agent_var = tk.StringVar(value=initial_agent)
    tk.Entry(frame, textvariable=agent_var, width=46).grid(row=1, column=1, pady=2)

    tk.Label(frame, text="รหัสลงทะเบียน").grid(row=2, column=0, sticky="w", pady=2)
    token_var = tk.StringVar()
    tk.Entry(frame, textvariable=token_var, width=46, show=None).grid(row=2, column=1, pady=2)

    status = tk.Label(root, text="", fg="green", font=("Segoe UI", 9))
    status.pack(padx=16, anchor="w")

    def on_submit() -> None:
        server = server_var.get().strip()
        agent_id = agent_var.get().strip()
        token = token_var.get().strip()
        if not server or not agent_id or not token:
            messagebox.showwarning("ยังไม่ครบ", "กรุณากรอกเซิร์ฟเวอร์ รหัสเครื่อง และรหัสลงทะเบียน")
            return
        try:
            status.config(text="กำลังลงทะเบียน...", fg="blue")
            root.update()
            secret = do_register(server, agent_id, token)
            cfg_path = save_config(server, agent_id, secret)
            started = ensure_startup()
            ok["value"] = True
            msg = f"สำเร็จ! เครื่องออนไลน์แล้ว\nไฟล์ตั้งค่าที่ {cfg_path}"
            if started:
                msg += "\nตั้งให้เปิดเองทุกครั้งที่เปิดเครื่องแล้ว"
            else:
                msg += "\n(เปิดเองอัตโนมัติไม่สำเร็จ — โปรแกรมจะทำงานตอนเปิดไฟล์นี้)"
            messagebox.showinfo("เสร็จแล้ว", msg)
            root.destroy()
        except Exception as exc:  # show plain Thai error, stay open for retry
            status.config(text="", fg="green")
            messagebox.showerror("ไม่สำเร็จ", str(exc)[:500])

    tk.Button(root, text="ลงทะเบียนและเริ่มเลย", command=on_submit,
              bg="#1d4ed8", fg="white", font=("Segoe UI", 11, "bold"),
              padx=12, pady=6).pack(padx=16, pady=(4, 16), fill="x")
    root.mainloop()
    return ok["value"]
