# Pretty Policy Analyzer

Analyze, compare, and find conflicts in Active Directory Group Policy (GPO) backups.

## Architecture

- **Backend**: Python FastAPI server that parses GPO backup files (gpreport.xml, registry.pol, GptTmpl.inf)
- **Frontend**: React + TypeScript + Tailwind CSS SPA
- **Desktop**: Electron shell that spawns the Python backend as a sidecar process

## Development

### Prerequisites
- Python 3.11+
- Node.js 18+
- npm

### Setup

```bash
# Install frontend + Electron dependencies
npm install

# Install backend dependencies
cd backend
pip install -r requirements.txt
```

### Run in Development

```bash
# Start both frontend and backend
npm run dev

# Or run individually:
npm run dev:frontend   # React dev server on :5173
npm run dev:backend    # FastAPI server on :8000
```

Open http://localhost:5173 in your browser and point it at a GPO backup folder.

### Build for Distribution

```bash
npm run package
```

This builds the React frontend, compiles Electron TypeScript, bundles the Python backend with PyInstaller, and packages everything into an installer.

## GPO Backup Format

The app expects a folder containing GUID-named subfolders, each with:
- `bkupInfo.xml` - Backup metadata (GPO name, domain, timestamps)
- `gpreport.xml` - Full policy report (Admin Templates, Security Settings)
- `DomainSysvol/GPO/Machine/registry.pol` - Binary registry policies
- `DomainSysvol/GPO/Machine/microsoft/windows nt/SecEdit/GptTmpl.inf` - Security template

These are standard Group Policy backup exports from `Backup-GPO` PowerShell cmdlet or GPMC.
