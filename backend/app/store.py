"""In-memory store for parsed GPO data."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from .analysis.categorizer import categorize_settings
from .models import GPODetail, ScanStatus
from .parsers.gpo_parser import scan_gpo_folder

CONFIG_DIR = Path.home() / ".gpoanalyzer"
CONFIG_FILE = CONFIG_DIR / "config.json"


class GPOStore:
    def __init__(self) -> None:
        self._gpos: dict[str, GPODetail] = {}
        self._folder_path: str = ""
        self._parse_errors: list[dict[str, str]] = []

    def scan(self, folder_path: str) -> ScanStatus:
        """Scan a folder for GPO backups and load them."""
        gpos, errors = scan_gpo_folder(folder_path)
        self._gpos.clear()
        self._parse_errors = errors

        for gpo in gpos:
            categorize_settings(gpo.settings)
            self._gpos[gpo.info.id] = gpo

        self._folder_path = folder_path
        self._save_config()

        return self.get_status()

    def get_status(self) -> ScanStatus:
        total_settings = sum(g.info.setting_count for g in self._gpos.values())
        return ScanStatus(
            folder_path=self._folder_path,
            gpo_count=len(self._gpos),
            total_settings=total_settings,
            parse_errors=self._parse_errors,
            loaded=len(self._gpos) > 0,
        )

    def get_all_gpos(self) -> list[GPODetail]:
        return sorted(self._gpos.values(), key=lambda g: g.info.display_name)

    def get_gpo(self, gpo_id: str) -> Optional[GPODetail]:
        return self._gpos.get(gpo_id)

    def clear(self) -> ScanStatus:
        """Clear all loaded GPO data."""
        import shutil
        self._gpos.clear()
        self._folder_path = ""
        self._parse_errors = []
        # Remove upload cache if present
        upload_dir = Path.home() / ".gpoanalyzer" / "upload_cache"
        if upload_dir.exists():
            shutil.rmtree(upload_dir, ignore_errors=True)
        # Clear saved config
        try:
            CONFIG_FILE.write_text(json.dumps({}, indent=2))
        except OSError:
            pass
        return self.get_status()

    def _save_config(self) -> None:
        try:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            config = {"last_folder": self._folder_path}
            CONFIG_FILE.write_text(json.dumps(config, indent=2))
        except OSError:
            pass

    def load_last_folder(self) -> Optional[str]:
        try:
            if CONFIG_FILE.is_file():
                config = json.loads(CONFIG_FILE.read_text())
                return config.get("last_folder")
        except (OSError, json.JSONDecodeError):
            pass
        return None


# Singleton
_store: Optional[GPOStore] = None


def get_store() -> GPOStore:
    global _store
    if _store is None:
        _store = GPOStore()
    return _store
