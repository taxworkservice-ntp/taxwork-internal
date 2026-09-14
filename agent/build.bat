@echo off
REM Build single-EXE TaxworkExpressBackupAgent.exe (bundled Python, no install needed on client).
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] python not found on PATH. Install Python 3.11+ from python.org and tick "Add to PATH".
  pause
  exit /b 1
)
python --version
echo [1/2] Installing deps...
python -m pip install -r requirements.txt pyinstaller
if errorlevel 1 (
  echo [ERROR] pip install failed. Check network and try again.
  pause
  exit /b 1
)
echo [2/2] Building EXE (takes 1-3 min)...
python -m PyInstaller --onefile --noconsole --name TaxworkExpressBackupAgent main.py
if errorlevel 1 (
  echo [ERROR] PyInstaller build failed. See output above.
  pause
  exit /b 1
)
echo.
echo DONE: dist\TaxworkExpressBackupAgent.exe
echo ZIP that single file + README-1page-TH.md and send to client.
pause
