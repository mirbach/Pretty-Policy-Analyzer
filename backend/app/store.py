"""In-memory store for parsed GPO data."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from .analysis.categorizer import categorize_settings
from .models import GPODetail, ScanStatus, BaselineStatus
from .parsers.gpo_parser import scan_gpo_folder

CONFIG_DIR = Path.home() / ".pretty-policy-analyzer"
CONFIG_FILE = CONFIG_DIR / "config.json"


class GPOStore:
    def __init__(self) -> None:
        self._gpos: dict[str, GPODetail] = {}
        self._folder_path: str = ""
        self._parse_errors: list[dict[str, str]] = []
        self._baselines: dict[str, GPODetail] = {}

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

    def add_or_replace_gpo(self, gpo: GPODetail) -> ScanStatus:
        """Add or replace a single GPO without clearing the rest."""
        categorize_settings(gpo.settings)
        self._gpos[gpo.info.id] = gpo
        return self.get_status()

    def clear(self) -> ScanStatus:
        """Clear all loaded GPO data."""
        import shutil
        self._gpos.clear()
        self._folder_path = ""
        self._parse_errors = []
        # Remove upload cache if present
        upload_dir = Path.home() / ".pretty-policy-analyzer" / "upload_cache"
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

    # ── Baseline methods ──────────────────────────────────────────────────────

    def scan_baselines(self, folder_path: str) -> BaselineStatus:
        """Parse a folder of GPO backups as security baselines."""
        gpos, errors = scan_gpo_folder(folder_path)
        for gpo in gpos:
            categorize_settings(gpo.settings)
            self._baselines[gpo.info.id] = gpo
        return BaselineStatus(
            baseline_count=len(self._baselines),
            loaded=len(self._baselines) > 0,
            parse_errors=errors,
        )

    def list_baselines(self) -> list[GPODetail]:
        return sorted(self._baselines.values(), key=lambda g: g.info.display_name)

    def get_baseline(self, baseline_id: str) -> Optional[GPODetail]:
        return self._baselines.get(baseline_id)

    def clear_baselines(self) -> BaselineStatus:
        self._baselines.clear()
        cache = Path.home() / ".pretty-policy-analyzer" / "baselines_cache"
        if cache.exists():
            import shutil
            shutil.rmtree(cache, ignore_errors=True)
        return BaselineStatus(baseline_count=0, loaded=False)


# Singleton
_store: Optional[GPOStore] = None


def get_store() -> GPOStore:
    global _store
    if _store is None:
        _store = GPOStore()
    return _store
