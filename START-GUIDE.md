# Start Guide — Express Backup (.exe + connect)

For people with very low tech. No Python, no commands, no JSON.

## Part A — Staff prepares the file (one time)

1. On your Windows, double-click `agent/build.bat` → wait 1–3 min → you get
   `agent/dist/TaxworkExpressBackupAgent.exe` (~18 MB).
2. Make a ZIP with just that one `.exe`.
3. On the web: `Express Backup → เพิ่มเครื่อง` → type machine name
   (e.g. `OFFICE-PC`) → copy **2 codes**: `รหัสเครื่อง` (long UUID)
   + `รหัสลงทะเบียน` (shown once only).
4. Send the ZIP + 2 codes to the client (LINE / USB).

## Part B — Client connects (2 minutes, forward this to them)

1. Unzip the file to Desktop (or `Documents`).
2. Right-click `TaxworkExpressBackupAgent.exe` → **Run as administrator** → Yes.
3. A window **“ลงทะเบียนเครื่อง”** opens by itself (first run only):
   - เซิร์ฟเวอร์: already filled (`https://internal.taxworkaccount.com`) — don't touch.
   - Paste **รหัสเครื่อง** + **รหัสลงทะเบียน** → click **“ลงทะเบียนและเริ่มเลย”**.
4. Wait for popup **“สำเร็จ! เครื่องออนไลน์แล้ว”** → OK. Done.
   The program keeps running invisibly. Nothing else to click.

## Part C — Staff verifies (on the web)

1. `Express Backup` page → machine shows `● ออนไลน์` + `เห็นล่าสุด` = just now.
2. Open the client → `สำรองข้อมูลตอนนี้` → within ~30 s:
   `กำลังสำรอง` → `ปกติ` + size + SHA.
3. `รับข้อมูล` modal should now list that machine (name + `●`)
   with path auto-filled — ready for one-click import.

## If it fails (plain words)

- **No window opens:** right-click → Run as administrator again
  (needed for auto-start setup).
- **“ลงทะเบียนไม่สำเร็จ / invalid registration”:** wrong codes or token
  already used → `เพิ่มเครื่อง` again on web, send fresh codes.
- **Offline in web:** program not running → double-click the EXE once more;
  check `Task Manager → TaxworkExpressBackupAgent.exe`;
  log at `%LOCALAPPDATA%\TaxworkExpressBackup\agent.log`.
- **Antivirus blocks it:** PyInstaller EXEs sometimes flag —
  click Allow / whitelist `TaxworkExpressBackupAgent.exe`.

## Files

- EXE source: `agent/` (`main.py` + `wizard.py`), build via `agent/build.bat`
- Client 1-pager (Thai): `agent/README-1page-TH.md`
- Deep dive: `docs/EXPRESS_BACKUP.md`
