<div align="center">

# Pretty Policy Analyzer

[![Build](https://github.com/mirbach/Pretty-Policy-Analyzer/actions/workflows/build.yml/badge.svg)](https://github.com/mirbach/Pretty-Policy-Analyzer/actions/workflows/build.yml)
[![Latest Release](https://img.shields.io/github/v/release/mirbach/Pretty-Policy-Analyzer)](https://github.com/mirbach/Pretty-Policy-Analyzer/releases/latest)
[![Pre-release](https://img.shields.io/github/v/release/mirbach/Pretty-Policy-Analyzer?include_prereleases&label=pre-release&color=orange)](https://github.com/mirbach/Pretty-Policy-Analyzer/releases)
[![Downloads](https://img.shields.io/github/downloads/mirbach/Pretty-Policy-Analyzer/total)](https://github.com/mirbach/Pretty-Policy-Analyzer/releases)
[![License: 0BSD](https://img.shields.io/badge/License-0BSD-blue.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/platform-Windows-0078D6?logo=data:image/svg%2bxml;base64,PHN2ZyByb2xlPSJpbWciIHZpZXdCb3g9IjAgMCAyNCAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBmaWxsPSJ3aGl0ZSI+PHRpdGxlPldpbmRvd3M8L3RpdGxlPjxwYXRoIGQ9Ik0wIDMuNTQ1IDkuODE4IDIuMTc0djkuMTRIMFYzLjU0NXpNMTAuOTA5IDIuMDIzIDI0IDB2MTEuMTRIMTAuOTA5VjIuMDIzek0wIDEyLjk1NWg5LjgxOHY5LjE0NkwwIDIwLjczMnYtNy43Nzd6TTEwLjkwOSAxMi45NTVIMjRWMjRsLTEzLjA5MS0xLjg0OXYtOS4xOTZ6Ii8+PC9zdmc+)](https://github.com/mirbach/Pretty-Policy-Analyzer/releases/latest)
[![Platform: Linux (Beta)](https://img.shields.io/badge/platform-Linux%20(Beta)-FCC624?logo=linux&logoColor=black)](https://github.com/mirbach/Pretty-Policy-Analyzer/releases/tag/v1.0.5)

<img width="1172" height="506" alt="Screenshot 2026-04-21 105355" src="https://github.com/user-attachments/assets/d90ff35a-dbfd-4817-9d17-48adaf451777" />

A desktop/web app for security engineers and Active Directory administrators to load, browse, compare, audit, and baseline-check Group Policy Object (GPO) backups — without needing a domain controller.

</div>

<div align="center">

[![Download for Windows](https://img.shields.io/badge/Download-Windows-0078D6?style=for-the-badge&logo=data:image/svg%2bxml;base64,PHN2ZyByb2xlPSJpbWciIHZpZXdCb3g9IjAgMCAyNCAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBmaWxsPSJ3aGl0ZSI+PHRpdGxlPldpbmRvd3M8L3RpdGxlPjxwYXRoIGQ9Ik0wIDMuNTQ1IDkuODE4IDIuMTc0djkuMTRIMFYzLjU0NXpNMTAuOTA5IDIuMDIzIDI0IDB2MTEuMTRIMTAuOTA5VjIuMDIzek0wIDEyLjk1NWg5LjgxOHY5LjE0NkwwIDIwLjczMnYtNy43Nzd6TTEwLjkwOSAxMi45NTVIMjRWMjRsLTEzLjA5MS0xLjg0OXYtOS4xOTZ6Ii8+PC9zdmc+)](https://github.com/mirbach/Pretty-Policy-Analyzer/releases/latest)
[![Download for Linux (Beta)](https://img.shields.io/badge/Download-Linux%20(Beta)-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/mirbach/Pretty-Policy-Analyzer/releases/tag/v1.0.5)

</div>

---

## Features

### Browse GPOs
Load a folder of GPO backup exports and browse every policy setting across all GPOs in a categorized tree. Each category (Administrative Templates, Security Settings, Audit Policy, Firewall Rules, etc.) is shown in a collapsible, searchable tree. Use the dark-mode UI to quickly scan large policy sets.

### AI-Powered Explanations
Every policy setting has a built-in AI assistant button. Click it to get a plain-English explanation of what the setting does, why it matters, and common misconfigurations. Supported providers:
- **OpenAI** (GPT-4o and others)
- **xAI** (Grok)
- **Google Gemini**

Enter your API key once via the Settings icon (top-right). Explanations are cached per-setting per-GPO so they survive tab switches and GPO reloads.

### Side-by-Side Compare
Select two or more GPOs using the checkboxes in the sidebar, then click **Compare** to open a side-by-side diff view. Settings that differ between policies are highlighted. Changed, added, and removed settings are each shown in distinct colours.

### Conflict Detection
The **Conflicts** view automatically finds settings that are configured in more than one GPO with different values — the exact conflicts a domain would resolve via GPO precedence order. Each conflict shows every GPO that touches the setting and what value each one sets, so you can identify unintended policy overlap at a glance.

### Global Search
The **Search** view lets you search every setting name and value across all loaded GPOs simultaneously. Results are grouped by GPO and link directly back to the setting inside its category tree.

### Security Baseline Compliance
The **Baseline** view compares all loaded GPOs against one or more Microsoft Security Baselines:

- Load baselines from the [Microsoft Security Compliance Toolkit](https://aka.ms/baselines) (the `GPOs` folder inside the baseline ZIP).
- Multiple baselines load **additively** — load Windows 11, Windows Server 2025, Edge, etc. one after another and they accumulate.
- Each baseline shows a compliance score bar with a percentage breakdown of:
  - **Compliant** — at least one GPO matches the baseline recommendation
  - **Wrong Value** — the setting is configured but with a different value than recommended
  - **Missing** — no GPO configures this setting at all
- Filter results by status (All / Missing / Wrong Value / Compliant) and free-text search by name.
- Expand any row to see the exact expected value vs. what each GPO currently sets.
- Bundled baselines included in the app:
  - Windows 10 1607 and Windows Server 2016 Security Baseline
  - Windows 10 Version 1809 and Windows Server 2019 Security Baseline
  - Windows 10 20H2 / Windows Server 20H2 Security Baseline
  - Windows 10 version 22H2 Security Baseline
  - Windows 11 v23H2 Security Baseline
  - Windows 11 v24H2 Security Baseline
  - Windows 11 v25H2 Security Baseline
  - Windows Server 2022 Security Baseline
  - Windows Server 2025 Security Baseline (2602)
  - Microsoft 365 Apps for Enterprise 2512
  - Microsoft Edge v139 Security Baseline

### Intune Migration Tracking
Track the progress of migrating on-prem GPOs to Microsoft Intune:

- **Per-setting status** — in the settings tree, mark each setting as **Not Migrated**, **Migrated**, or **Won't Migrate** (the latter requires a reason, e.g. "domain-specific, no Intune equivalent"). Status is tracked per stable AD GPO GUID, so it survives re-exporting/rescanning the same GPO.
- **Migration Report view** — a dedicated dashboard (toolbar → **Migration**) aggregating status across every loaded GPO: a completion progress bar, filterable tabs (All / Migrated / Not Migrated / Won't Migrate), free-text search, and a warning badge for "Won't Migrate" entries still missing a reason.
- **Export** — download the full migration report as an Excel spreadsheet for status reporting.
- **AI-generated Intune mapping** — from a GPO's **Explain & Intune Migration** action, generate a Markdown table of equivalent Intune Settings Catalog / OMA-URI mappings, or export a ready-to-import **Intune JSON** file (Microsoft Graph `windows10CustomConfiguration` Custom OMA-URI profiles). Large GPOs are processed in batches; settings without a direct Intune equivalent are listed separately with a reason instead of a guessed mapping.
- **Backup/restore** — migration status is included alongside GPOs and the AI cache in the app's backup/restore feature (see the Backup/Restore icons in the toolbar).

### Export to Excel
Select GPOs for comparison, then use the **Export** button to download a formatted Excel spreadsheet (`.xlsx`) with all selected GPO settings for offline review or compliance evidence collection.

### Import Effective Local Policy
Click the **Monitor** icon (🖥) in the toolbar to import the Resultant Set of Policy (RSoP) from the machine where the app is running. This executes `gpresult /X` behind the scenes and loads the merged, effective policy — exactly what the machine has applied — as a GPO entry called **"Effective Policy — \<hostname\>"**.

- A **UAC elevation prompt** is shown automatically when the app is not already running as Administrator (required to retrieve Computer-scope policies).
- The imported entry appears in the GPO list and can be browsed, searched, compared side-by-side with GPO backups, and checked against security baselines.
- Only **registry-based and security settings** are captured (the same data that GPO backup exports contain). Non-registry extensions such as Software Installation and Scripts are not included.
- Re-clicking the button refreshes the data with a new `gpresult` run.
- Only available on Windows.

### Dark Mode
Dark mode is enabled by default. Toggle it with the moon/sun icon in the toolbar. The preference is persisted across sessions.

### Folder Loading
- **Browser** (Chrome / Edge): uses the native `showDirectoryPicker()` API for zero-friction folder selection.
- **Electron desktop**: uses a native OS folder-picker dialog via Electron IPC.
- **Firefox fallback**: inline text-path input field.

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.13, FastAPI, uvicorn, lxml, pydantic v2 |
| Frontend | React 19, TypeScript 5.8, Vite 6, Tailwind CSS 3 |
| State | @tanstack/react-query 5, axios |
| Icons | lucide-react |
| Export | SheetJS (xlsx) |
| Desktop | Electron (optional wrapper, native folder picker IPC) |

---

## Development

### Prerequisites
- Python 3.13
- Node.js 18+
- npm
- (Optional, for icon rebuild) ImageMagick (`magick` on PATH)

### Setup

```powershell
# Install root + frontend dependencies
npm install

# Install backend dependencies
cd backend
pip install -r requirements.txt
```

### Run in Development

Start both the backend and frontend together from the repo root:

```powershell
npm run dev
```

Or run them individually:

**Backend** (port 8000):
```powershell
Set-Location c:\git\Pretty-Policy-Analyzer\backend
$env:PYTHONPATH = "c:\git\Pretty-Policy-Analyzer\backend"
python3.13 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend** (port 5173):
```powershell
Set-Location c:\git\Pretty-Policy-Analyzer\frontend
npm run dev
```

Open `http://localhost:5173` in **Chrome or Edge** (required for `showDirectoryPicker` support).

If port 8000 is already in use, free it first:
```powershell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue
```

---

## Building the Electron App

> The steps below cover the Windows build. For Linux (AppImage/deb/rpm,
> including a WSL2 setup guide) and macOS, see [BUILDING.md](BUILDING.md).

### Step 1 — Build all artefacts

The `build` script compiles the frontend, transpiles the Electron TypeScript, and bundles the Python backend with PyInstaller:

```powershell
npm run build
```

This runs the following steps in order:
1. `sync:icon` — regenerates `electron/icon.ico` from `frontend/src/assets/PPALogo.png` (requires ImageMagick).
2. `build:frontend` — runs `vite build` inside `frontend/`.
3. `build:electron` — compiles `electron/*.ts` → `dist-electron/`.
4. `build:backend` — runs PyInstaller using `backend/gpo-backend.spec` to produce a self-contained `backend/dist/gpo-backend` binary.

### Step 2a — Package (portable, no installer)

Creates a portable directory under `release/` using `electron-packager`:

```powershell
npm run package:win
```

Output: `release/Pretty Policy Analyzer-win32-x64/`

### Step 2b — Build the Windows Installer (NSIS)

Creates a one-click NSIS installer EXE under `release/`:

```powershell
npm run installer:win
```

Output: `release/Pretty Policy Analyzer Setup <version>.exe`

The installer:
- Lets the user choose an installation directory (not a one-click install).
- Bundles the self-contained Python backend binary — no Python runtime required on the target machine.
- Bundles all security baselines (Windows 10/11, Windows Server 2016–2025, Microsoft 365 Apps for Enterprise 2512, Microsoft Edge v139).
- Signs nothing by default (`CSC_IDENTITY_AUTO_DISCOVERY=false`) — add a code-signing certificate to remove the SmartScreen warning.

> **Note:** Code signing is disabled by default. To sign the installer, remove `set CSC_IDENTITY_AUTO_DISCOVERY=false&&` from the `installer:win` script and configure a valid certificate via the `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` environment variables.

---

## GPO Backup Format

The app expects a folder containing GUID-named subfolders — the standard output of `Backup-GPO` (PowerShell) or the GPMC **Back Up All** action. Each subfolder contains:

| File | Contents |
|------|----------|
| `bkupInfo.xml` | Backup metadata (GPO name, domain, timestamps) |
| `gpreport.xml` | Full policy report (Admin Templates, Security Settings) |
| `DomainSysvol/GPO/Machine/registry.pol` | Binary registry policies |
| `DomainSysvol/GPO/Machine/microsoft/windows nt/SecEdit/GptTmpl.inf` | Security template (password policy, audit, privileges) |

### Exporting GPO Backups

```powershell
# Export all GPOs from a domain
Backup-GPO -All -Path C:\GPOBackups

# Export a single GPO by name
Backup-GPO -Name "Default Domain Policy" -Path C:\GPOBackups
```

---
