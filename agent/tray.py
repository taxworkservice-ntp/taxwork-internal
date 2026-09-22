"""System-tray presence for the agent (Windows, optional dependency).

Lets non-technical users SEE that the agent is running (and quit it) instead
of wondering why double-clicking the EXE appears to do nothing. If pystray /
Pillow are unavailable the agent simply runs headless as before.
"""

from __future__ import annotations

import os
import threading
from collections.abc import Callable


def _make_icon_image():
    from PIL import Image, ImageDraw

    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse((2, 2, size - 2, size - 2), fill=(29, 78, 216, 255))
    draw.rectangle((16, 15, 48, 25), fill=(255, 255, 255, 255))
    draw.rectangle((26, 15, 38, 49), fill=(255, 255, 255, 255))
    return img


def start_tray(on_quit: Callable[[], None], log_dir: str | None = None) -> bool:
    """Start a tray icon in a background thread. Returns True if it started."""
    try:
        import pystray
    except Exception:
        return False
    try:
        image = _make_icon_image()
    except Exception:
        return False

    def open_logs(icon, item):  # noqa: ANN001 - pystray callback signature
        if log_dir and os.path.isdir(log_dir):
            os.startfile(log_dir)  # noqa: S606 - trusted local folder

    def quit_app(icon, item):  # noqa: ANN001
        try:
            icon.stop()
        finally:
            on_quit()

    menu = pystray.Menu(
        pystray.MenuItem("Taxwork Express Backup — กำลังทำงาน", None, enabled=False),
        pystray.MenuItem("เปิดโฟลเดอร์บันทึก (log)", open_logs),
        pystray.MenuItem("ออกจากโปรแกรม", quit_app),
    )
    icon = pystray.Icon("TaxworkExpressBackup", image, "Taxwork Express Backup", menu)

    def runner() -> None:
        try:
            icon.run()
        except Exception:
            pass

    threading.Thread(target=runner, daemon=True).start()
    return True
