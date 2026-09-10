# Taxwork Express Backup Agent (Windows)

Small Python poller that runs on the Windows machine holding the Express data.
It performs the actual backup; the web app only configures, monitors, and serves downloads.

```
Express data folder
        │  (read-only ZIP)
Windows agent (this folder)
        │  HTTPS + Bearer credential
Taxwork Internal (Next.js)
        │  presigned PUT
Cloudflare R2 (express-backups/...)
```

## 1. Register the machine (one time)

1. Web: **Express Backup → เพิ่มเครื่อง** → enter machine name → copy the one-time token (`ABC-123-XYZ`, shown once).
2. On Windows, create `%LOCALAPPDATA%\TaxworkExpressBackup\config.json`:

```json
{
  "server_url": "https://internal.taxworkaccount.com",
  "agent_id": "<uuid shown in web>",
  "agent_secret": "",
  "poll_interval": 30,
  "heartbeat_interval": 60,
  "version": "1.0.0"
}
```

3. Register and store the long-lived secret:

```bat
pip install -r requirements.txt
python main.py --register
```

Paste the token when asked. Put the printed secret into `config.json` as `agent_secret`.

## 2. Start the agent

```bat
python main.py
```

Confirm in the web UI: **เครื่องออนไลน์** and “เห็นล่าสุด” updating.

## 3. Run on startup (Task Scheduler, V1-approved)

1. Open Task Scheduler → Create Task.
2. Trigger: **At log on** (or At startup with a service account that can read the Express folder).
3. Action: `pythonw.exe C:\TaxworkAgent\main.py` (use `pythonw` for no console window).
4. Condition: Start only if network available; **do NOT require admin** unless the Express folder needs it.

Alternative without admin rights: Startup-folder launcher (same effect, per-user).
Save as `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\TaxworkExpressBackupAgent.vbs`:

```vb
CreateObject("Wscript.Shell").Run """C:\Path\To\pythonw.exe"" ""C:\TaxworkAgent\main.py""", 0, False
```

Double-click it once to start now. Logs go to
`%LOCALAPPDATA%\TaxworkExpressBackup\agent.log` — if the file stays empty,
the agent is not running (check Task Manager for `pythonw.exe`).

## 4. Test without touching real data

Set in `config.json`:

```json
{ "test_source_path": "C:\\TaxworkAgentTest\\SampleData" }
```

The agent backs up the dummy folder instead of every job's `source_path`.
Never point tests at real accounting data. Remove the key for production.

Note: when the same client exists on several machines at different folders, each
machine gets its own path in the web UI (client page → พาธตามเครื่อง). The server
sends this machine's folder with every job — no agent config needed for that.

## 5. Manual backup check

1. Web: open a client → **สำรองข้อมูลตอนนี้** → status becomes รอดำเนินการ.
2. Within ~30 s the agent claims it (กำลังสำรอง), uploads, and the web shows ปกติ with size + SHA-256.
3. **ดาวน์โหลด** the ZIP from history and verify it opens.

## 5b. Assisted restore (export to another machine)

Requires two human approvals in the web UI — the agent never places files on its own:

1. Client page → export card → pick target machine + folder → **ขอส่งออก**, then **อนุมัติ**.
2. The target agent downloads, verifies SHA-256, extracts to
   `%LOCALAPPDATA%\TaxworkExpressBackup\staging\` and reports staged.
3. Verify the staged report in the web UI → **ยืนยันนำเข้าที่**.
4. The agent copies the existing target to `<target>.bak-<id8>` (rollback),
   merges the staged files in (nothing deleted), and reports completion.
5. Open Express on the target machine and verify the company before continuing work.

Staging survives restarts and is cleaned after completion. Logs:
`%LOCALAPPDATA%\TaxworkExpressBackup\agent.log`.

Compatibility: old agents ignore restores (endpoints are additive); a new agent
against an old server treats missing restore endpoints as "no work" and keeps
backing up normally.

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `AUTH_FAILED` / 401 | Wrong `agent_id`/secret, or machine revoked (เพิกถอนเครื่อง). Re-register. |
| `SOURCE_NOT_FOUND` | `source_path` in backup settings is wrong or drive not mounted. Fix path in web UI → retry. |
| `ACCESS_DENIED` | Agent user cannot read the Express folder. Run as a user with read rights. |
| `UPLOAD_FAILED` | No network / R2 unreachable. Temp ZIP is kept and the job can be retried. |
| Job stuck กำลังสำรอง | Crashed agent. Web auto-reclaims after 2 h without heartbeat (reclaimStaleJobs). |

## 7. Security

- `config.json` holds the credential — protect it with NTFS permissions, never commit it.
- The agent can only: heartbeat, list/claim its jobs, get upload URLs, report results.
- It cannot read other clients, credentials, tasks, or arbitrary R2 paths (server derives keys).
- The source directory is **never modified** — only zipped.

## 8. Build an EXE (optional, later)

```bat
pip install pyinstaller
pyinstaller --onefile --noconsole --name TaxworkExpressBackupAgent main.py
```

Point Task Scheduler at the resulting `.exe` instead of `pythonw`.
