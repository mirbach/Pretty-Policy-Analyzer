# Pretty Policy Analyzer

A desktop/web app for security engineers and Active Directory administrators to load, browse, compare, audit, and baseline-check Group Policy Object (GPO) backups — without needing a domain controller.

---

## Features

### Browse GPOs
Load a folder of GPO backup exports and browse every policy setting across all GPOs in a categorized tree. Each category (Administrative Templates, Security Settings, Audit Policy, Firewall Rules, etc.) is shown in a collapsible tree. Use the dark-mode UI to quickly scan large policy sets.

### AI-Powered Explanations
Every policy setting has a built-in AI assistant button. Click it to get a plain-English explanation of what the setting does, why it matters, and common misconfigurations. Supports OpenAI, xAI (Grok), and Google Gemini — enter your API key once via the Settings icon. Explanations are cached per-setting per-GPO so they survive tab switches and GPO changes.

### Side-by-Side Compare
Select two or more GPOs using the checkboxes in the sidebar, then click **Compare** to open a side-by-side diff view. Settings that differ between policies are highlighted.

### Conflict Detection
The **Conflicts** view automatically finds settings that are configured in more than one GPO with different values — the exact conflicts a domain would resolve via GPO precedence order. Each conflict shows every GPO that touches the setting and what value each one sets.

### Global Search
The **Search** view lets you search every setting name and value across all loaded GPOs simultaneously. Results link back to the GPO and category they belong to.

### Security Baseline Compliance
The **Baseline** view compares all loaded GPOs against one or more Microsoft Security Baselines:

- Load baselines from the [Microsoft Security Compliance Toolkit](https://aka.ms/baselines) (the `GPOs` folder inside the baseline ZIP).
- Multiple baselines load **additively** — load Windows 11, Windows Server 2025, Edge, etc. one after another.
- Each baseline shows a compliance score bar with a breakdown of:
  - **Compliant** — at least one GPO matches the baseline recommendation
  - **Wrong Value** — the setting is configured but with a different value than recommended
  - **Missing** — no GPO configures this setting at all
- Filter by status (All / Missing / Wrong Value / Compliant) and search by name.
- Expand any row to see the exact expected value vs. what each GPO currently sets.

### Export to Excel
Select GPOs for comparison, then use the **Export** button to download a formatted Excel spreadsheet with all selected GPO settings for offline review or evidence collection.

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

### Setup

```powershell
# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ..\backend
pip install -r requirements.txt
```

### Run in Development

**Backend** (port 8000):
```powershell
Set-Location c:\git\Pretty-Policy-Analyzer\backend
$env:PYTHONPATH = "c:\git\Pretty-Policy-Analyzer\backend"
python3.13 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**Frontend** (port 5173):
```powershell
Set-Location c:\git\Pretty-Policy-Analyzer\frontend
npm run dev
```

Open `http://localhost:5173` in **Chrome or Edge** (required for `showDirectoryPicker` support).

### Build for Distribution

```bash
npm run package
```

Builds the React frontend, compiles Electron TypeScript, bundles the Python backend with PyInstaller, and packages everything into an installer.

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

## Security Baseline Setup

1. Download the baseline ZIP from https://aka.ms/baselines (e.g. *Windows 11 Security Baseline*).
2. Extract and locate the `GPOs` subfolder — it contains GUID-named GPO backup folders.
3. In the app, click **Baseline** → **Load Baseline** and select that `GPOs` folder.
4. Repeat for additional baselines (Windows Server, Edge, etc.) — they accumulate additively.
5. The compliance report runs automatically against all loaded GPOs.
