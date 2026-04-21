"""Parse bkupInfo.xml and Backup.xml for GPO metadata."""

from __future__ import annotations

import os
from typing import Optional

from lxml import etree

from ..models import GPOInfo
from ._path_utils import safe_resolve_dir

MANIFEST_NS = "http://www.microsoft.com/GroupPolicy/GPOOperations/Manifest"
OPERATIONS_NS = "http://www.microsoft.com/GroupPolicy/GPOOperations"


def _text(el: Optional[etree._Element]) -> str:
    if el is None:
        return ""
    return (el.text or "").strip()


def parse_bkupinfo(folder_path: str) -> GPOInfo | None:
    """Parse bkupInfo.xml to extract GPO metadata."""
    try:
        safe_folder = safe_resolve_dir(folder_path)
    except ValueError:
        return None
    bkup_path = os.path.join(safe_folder, "bkupInfo.xml")
    if not os.path.isfile(bkup_path):  # lgtm[py/path-injection]
        return None

    # Use a safe parser to prevent XXE attacks
    _safe_parser = etree.XMLParser(resolve_entities=False, no_network=True)
    tree = etree.parse(bkup_path, _safe_parser)  # lgtm[py/path-injection]
    root = tree.getroot()
    ns = {"m": MANIFEST_NS}

    backup_id = os.path.basename(safe_folder)

    return GPOInfo(
        id=backup_id,
        gpo_guid=_text(root.find("m:GPOGuid", ns)),
        display_name=_text(root.find("m:GPODisplayName", ns)) or _text(root.find("m:Comment", ns)),
        domain=_text(root.find("m:GPODomain", ns)),
        domain_controller=_text(root.find("m:GPODomainController", ns)),
        backup_time=_text(root.find("m:BackupTime", ns)),
    )
