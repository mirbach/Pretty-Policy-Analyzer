# Copilot Instructions for Pretty Policy Analyzer

## After Every Change

After making **any** code change, you must:

1. **Run the TypeScript build** to verify the frontend compiles cleanly:
   ```powershell
   cd c:\git\Pretty-Policy-Analyzer\frontend
   npx tsc --noEmit
   ```

2. **Fix all Problems** — the build must produce **zero errors and zero warnings** in the VS Code Problems panel before considering the task done. Do not leave any TypeScript errors, lint errors, or type issues unresolved.

3. **Restart the backend** if any Python file was changed:
   ```powershell
   Stop-Process -Id (Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue
   Set-Location c:\git\Pretty-Policy-Analyzer\backend
   $env:PYTHONPATH = "c:\git\Pretty-Policy-Analyzer\backend"
   python3.13 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

## Project Structure

```
Pretty-Policy-Analyzer/
  backend/          # Python 3.13 FastAPI backend
    app/
      main.py       # FastAPI app entry point, API routes
      models.py     # Pydantic models
      store.py      # In-memory GPO store (singleton)
      routers/      # gpos.py, compare.py, conflicts.py
      parsers/      # gpo_parser.py, gpreport_parser.py, backup_parser.py, etc.
      analysis/     # categorizer.py
  frontend/         # React 19 + TypeScript + Vite + Tailwind CSS v3
    src/
      App.tsx       # Root component, view routing
      components/   # Toolbar, WelcomeScreen, GPODetail, GPOList, SettingsTree, etc.
      hooks/        # useApi.ts, useDarkMode.ts
      lib/          # api.ts (axios client)
      types/        # gpo.ts (TypeScript types)
  electron/         # Electron shell (optional desktop wrapper)
  GPOImport/        # Sample GPO backup data (git-ignored)
```

## Tech Stack

- **Backend**: Python 3.13, FastAPI, uvicorn, lxml, pydantic v2
- **Frontend**: React 19, TypeScript 5.8, Vite 6, Tailwind CSS 3, @tanstack/react-query 5, axios, lucide-react, react-router-dom 7
- **Electron**: Optional desktop shell with native folder picker IPC (`window.__electronAPI.selectFolder`)

## Running the App

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

## Key Conventions

- Dark mode is enabled by default (`useDarkMode` defaults to `true`).
- Tailwind `darkMode: 'class'` — the `dark` class is toggled on `<html>`.
- Custom color palette uses `surface-50` through `surface-950`.
- Folder picker uses `window.showDirectoryPicker()` in browser (Chrome/Edge), Electron IPC in desktop, and inline text input as a Firefox fallback.
- Uploaded GPO files are written to `~/.pretty-policy-analyzer/upload_cache/` and scanned from there.
- Backend port-conflict fix: `Stop-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess -Force`
- GPO XML files may be UTF-16 or UTF-8; `gpreport_parser.py` handles both via BOM detection.
