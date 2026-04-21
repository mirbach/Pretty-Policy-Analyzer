"""Parse gpresult /X XML output (Resultant Set of Policy)."""

from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile

from lxml import etree

from ..models import GPODetail, GPOInfo, PolicyScope
from .gpreport_parser import (
    _parse_registry_policies,
    _parse_security_settings,
    REGISTRY_NS,
    SECURITY_NS,
)

# RSoP root namespace
RSOP_NS = "http://www.microsoft.com/GroupPolicy/Rsop"


def _is_admin() -> bool:
    """Return True if the current process has administrator privileges."""
    if sys.platform != "win32":
        return False
    try:
        import ctypes
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def run_gpresult(scope: str = "both") -> str:
    """
    Run gpresult /X and return the path to the temporary XML file.
    Elevates via UAC prompt automatically when not already running as admin.
    Caller is responsible for deleting the file.
    scope: 'computer', 'user', or 'both'
    """
    if sys.platform != "win32":
        raise RuntimeError("gpresult is only available on Windows")

    tmp = tempfile.NamedTemporaryFile(suffix=".xml", delete=False)
    tmp.close()
    xml_path = tmp.name

    if _is_admin():
        _run_gpresult_direct(xml_path, scope)
    else:
        _run_gpresult_elevated(xml_path, scope)

    if not os.path.isfile(xml_path) or os.path.getsize(xml_path) == 0:
        raise RuntimeError(
            "gpresult produced no output. "
            "The UAC prompt may have been cancelled, or Group Policy is not available on this machine."
        )

    return xml_path


def _run_gpresult_direct(xml_path: str, scope: str) -> None:
    """Run gpresult in the current (already-elevated) process."""
    cmd = ["gpresult", "/X", xml_path, "/F"]
    if scope == "computer":
        cmd += ["/scope", "computer"]
    elif scope == "user":
        cmd += ["/scope", "user"]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except FileNotFoundError:
        raise RuntimeError("gpresult.exe not found. Make sure this is running on a Windows machine.")
    except subprocess.TimeoutExpired:
        raise RuntimeError("gpresult timed out after 60 seconds.")

    if result.returncode != 0:
        detail = (result.stderr or result.stdout or f"exit code {result.returncode}").strip()
        raise RuntimeError(f"gpresult failed: {detail}")


def _run_gpresult_elevated(xml_path: str, scope: str) -> None:
    """
    Run gpresult elevated via PowerShell Start-Process -Verb RunAs.
    This triggers a UAC prompt. The call blocks until gpresult finishes.
    """
    # Build the argument list for gpresult as a PowerShell array literal
    arg_parts = [f'"/X"', f'"{xml_path}"', '"/F"']
    if scope == "computer":
        arg_parts += ['"/scope"', '"computer"']
    elif scope == "user":
        arg_parts += ['"/scope"', '"user"']
    ps_arg_list = ",".join(arg_parts)

    ps_command = (
        f"$p = Start-Process -FilePath 'gpresult' "
        f"-ArgumentList {ps_arg_list} "
        f"-Verb RunAs -Wait -WindowStyle Hidden -PassThru; "
        f"exit $p.ExitCode"
    )

    try:
        result = subprocess.run(
            ["powershell", "-NonInteractive", "-Command", ps_command],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except FileNotFoundError:
        raise RuntimeError("powershell.exe not found.")
    except subprocess.TimeoutExpired:
        raise RuntimeError("Elevated gpresult timed out after 120 seconds.")

    # Exit code 740 = "The requested operation requires elevation" — UAC was cancelled
    if result.returncode == 740:
        raise RuntimeError("UAC elevation was cancelled. Please accept the administrator prompt to import local policy.")
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or f"exit code {result.returncode}").strip()
        raise RuntimeError(f"Elevated gpresult failed: {detail}")


def parse_gpresult_xml(xml_path: str) -> tuple[GPODetail, list[str]]:
    """Parse a gpresult /X XML file and return a GPODetail + warnings."""
    warnings: list[str] = []

    with open(xml_path, "rb") as f:
        raw = f.read()

    # Handle BOM / encoding declaration the same way as gpreport_parser
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        text = raw.decode("utf-16")
    else:
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("latin-1")

    text = re.sub(
        r'(<\?xml[^?]*?)encoding=["\'][^"\']*["\']',
        r'\1encoding="utf-8"',
        text,
        count=1,
        flags=re.IGNORECASE,
    )

    try:
        root = etree.fromstring(text.encode("utf-8"))
    except etree.XMLSyntaxError as e:
        raise RuntimeError(f"XML parse error in gpresult output: {e}")

    settings: list[PolicySetting] = []

    # The RSoP XML has <ComputerResults> and <UserResults> at the root.
    # Each contains <ExtensionData> elements with the same extension namespaces
    # as in individual gpreport.xml files.
    scope_map = [
        ("ComputerResults", PolicyScope.COMPUTER),
        ("UserResults", PolicyScope.USER),
    ]

    for tag, scope in scope_map:
        # Try with and without namespace
        scope_el = root.find(f"{{{RSOP_NS}}}{tag}")
        if scope_el is None:
            scope_el = root.find(tag)
        if scope_el is None:
            continue

        for ext_data in _iter_children(scope_el, "ExtensionData"):
            ext_el = _first_child(ext_data, "Extension")
            if ext_el is None:
                continue

            xsi_type = ext_el.get("{http://www.w3.org/2001/XMLSchema-instance}type", "")

            try:
                if "RegistrySettings" in xsi_type or ext_el.find(f"{{{REGISTRY_NS}}}Policy") is not None:
                    settings.extend(_parse_registry_policies(ext_el, scope))
                elif (
                    "SecuritySettings" in xsi_type
                    or ext_el.find(f"{{{SECURITY_NS}}}SecurityOptions") is not None
                ):
                    settings.extend(_parse_security_settings(ext_el, scope))
            except Exception as e:
                warnings.append(f"Error parsing RSoP extension ({xsi_type}): {e}")

    import socket
    hostname = socket.gethostname()

    info = GPOInfo(
        id="local-gpresult",
        gpo_guid="",
        display_name=f"Effective Policy — {hostname}",
        domain="",
    )
    info.setting_count = len(settings)

    return GPODetail(info=info, settings=settings, parse_warnings=warnings), warnings


def _iter_children(el: etree._Element, local_name: str):
    """Yield direct children matching local_name, regardless of namespace."""
    for child in el:
        if etree.QName(child.tag).localname == local_name:
            yield child


def _first_child(el: etree._Element, local_name: str):
    """Return first direct child matching local_name, or None."""
    for child in el:
        if etree.QName(child.tag).localname == local_name:
            return child
    return None
