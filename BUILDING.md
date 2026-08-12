# Building Pretty Policy Analyzer

This document covers building the packaged Electron app for Windows, Linux,
and macOS. For running the app from source in development mode, see the
[Development](README.md#development) section of the README instead.

## How packaging works

The build pipeline (`npm run build`) always does the same four things,
regardless of target OS:

1. `sync:icon` — regenerates `electron/icon.ico` and `electron/icon.png`
   from `frontend/src/assets/PPALogo.png` (requires ImageMagick's `magick`
   CLI).
2. `build:frontend` — `vite build` inside `frontend/`.
3. `build:electron` — compiles `electron/*.ts` → `dist-electron/`.
4. `build:backend` — runs PyInstaller (`backend/gpo-backend.spec`) to
   produce a **self-contained** Python backend binary at
   `backend/dist/gpo-backend/`. No Python runtime is required on the
   machine that eventually runs the packaged app.

**Important:** PyInstaller does not cross-compile. A backend binary built
on Windows only runs on Windows; one built on Linux only runs on Linux, and
so on. This means **you must build on (or under) the target OS** — there is
no way to produce a Linux or macOS release from a Windows checkout alone.
That's what the WSL2 section below is for.

| Target       | Built with                          | Produced by            |
|--------------|--------------------------------------|-------------------------|
| Windows      | `electron-builder` (NSIS) / `electron-packager` (portable) | Windows host |
| Linux        | `electron-builder` (AppImage, deb, rpm) | Linux host (native or WSL2) |
| macOS        | `electron-builder` (dmg)             | macOS host (Xcode CLT required) |

---

## Windows

Prerequisites: Python 3.13, Node.js 18+, npm, and (only for `sync:icon`)
[ImageMagick](https://imagemagick.org/) with `magick` on `PATH`.

```powershell
npm install
cd backend; pip install -r requirements.txt; cd ..

# One-click NSIS installer -> release\Pretty Policy Analyzer Setup <version>.exe
npm run installer:win

# Portable, no installer -> release\Pretty Policy Analyzer-win32-x64\
npm run package:win

# Portable, zipped -> release\Pretty Policy Analyzer Portable <version>.zip
npm run portable:win
```

Code signing is disabled by default (`CSC_IDENTITY_AUTO_DISCOVERY=false`),
so the NSIS installer will trigger a SmartScreen warning. To sign it, drop
that flag from the `installer:win` script and set `WIN_CSC_LINK` /
`WIN_CSC_KEY_PASSWORD`.

---

## Linux

Linux packaging targets **AppImage**, **deb**, and **rpm** (configured in
`package.json` under `build.linux`). You need a real Linux kernel to build
these — WSL2 works fine since it runs an actual Linux kernel, not
emulation.

### Option A — WSL2 (recommended if you're on Windows)

1. **Install a distro** (skip if you already have one):
   ```powershell
   wsl --install -d Ubuntu
   ```

2. **Install system packages** inside the WSL distro. Python 3.13 isn't in
   Ubuntu 24.04's default repos, so it comes from the deadsnakes PPA:
   ```bash
   sudo apt update
   sudo apt install -y software-properties-common
   sudo add-apt-repository -y ppa:deadsnakes/ppa
   sudo apt update
   sudo apt install -y python3.13 python3.13-venv python3.13-dev \
       imagemagick rpm dpkg-dev fakeroot build-essential
   ```

3. **Install Node.js** via [nvm](https://github.com/nvm-sh/nvm) (no sudo
   needed, and avoids clashing with any Windows Node.js on `PATH`):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   source ~/.bashrc
   nvm install --lts
   ```

4. **Clone into the WSL native filesystem** — not `/mnt/c/...`. Building
   against a repo on the Windows-mounted drive works, but `node_modules`
   installed there gets Linux-native binaries (Rollup, esbuild, Electron,
   electron-builder's helper tools) mixed into a folder your Windows-side
   editor/build also uses, which breaks the Windows build afterwards. A
   separate native-filesystem clone keeps the two fully isolated:
   ```bash
   mkdir -p ~/build
   git clone https://github.com/mirbach/Pretty-Policy-Analyzer.git ~/build/Pretty-Policy-Analyzer
   cd ~/build/Pretty-Policy-Analyzer
   ```

5. **`package.json`'s `author` field must be an object with an `email`.**
   `electron-builder`'s deb/rpm packaging (via `fpm`) refuses to build
   without one — it's used as the package `Maintainer:`/`Vendor:` field:
   ```json
   "author": { "name": "Pretty Policy Analyzer", "email": "you@example.com" }
   ```

6. **Bootstrap pip for 3.13** (the deadsnakes package doesn't include it)
   and install backend deps + PyInstaller (PyInstaller itself isn't in
   `requirements.txt` since it's a build tool, not a runtime dependency):
   ```bash
   python3.13 -m ensurepip --upgrade
   cd backend
   python3.13 -m pip install -r requirements.txt pyinstaller
   cd ..
   ```

7. **Install Node deps and build:**
   ```bash
   npm install          # root + frontend (postinstall)
   npm run installer:linux
   ```

   Output lands in `release/`: a `.AppImage`, a `.deb`, and a `.rpm`.

   > **Note:** Ubuntu's `imagemagick` package installs ImageMagick 6, which
   > only provides `convert` — not the `magick` binary the `sync:icon`
   > script calls. Since the icons in `electron/` are already committed and
   > only need regenerating when the source logo changes, run the build
   > steps individually instead of `npm run installer:linux` if `sync:icon`
   > fails:
   > ```bash
   > npm run build:frontend && npm run build:electron && npm run build:backend
   > npx electron-builder --linux AppImage deb rpm --publish never
   > ```
   >
   > **Also note:** `electron` and `electron-builder`'s helper-tool
   > downloads (from GitHub Releases) occasionally fail mid-transfer with
   > `RequestError: socket hang up` even when `curl` to the same URL
   > succeeds — this is Node's HTTP client, not a real outage. Just re-run
   > the command; it resumes from what's already cached. If `npm install`
   > itself fails this way, note that npm deletes the *entire*
   > `node_modules` tree on a failed postinstall — re-run it with
   > `--ignore-scripts` first (`npm install --ignore-scripts`), then run
   > `node node_modules/electron/install.js` separately so a flaky download
   > doesn't cost you the whole dependency tree again.
   >
   > **If you're behind a VPN and every large download hangs (not just
   > occasionally):** check `ip link show eth0` inside WSL for an unusually
   > low MTU (anything under 1500 — a VPN adapter's MTU can leak into
   > WSL2's default NAT networking and silently break big HTTPS transfers).
   > The fix is switching WSL2 to mirrored networking, which routes traffic
   > over the host's real interfaces instead of a single virtual NAT
   > switch. Add to `%USERPROFILE%\.wslconfig` on the **Windows** side (no
   > WSL sudo needed) and restart WSL:
   > ```ini
   > [wsl2]
   > networkingMode=mirrored
   > ```
   > ```powershell
   > wsl --shutdown
   > ```

8. **Pull the artifacts back to Windows** if you need them there:
   ```bash
   cp release/*.AppImage release/*.deb release/*.rpm /mnt/c/Users/<you>/Desktop/
   ```

### Option B — Native Linux / CI

Same steps as above minus the WSL-specific setup — install Python 3.13,
Node.js 18+, ImageMagick, and `rpm`/`dpkg-dev`/`fakeroot` through your
distro's package manager, then run `npm install` and
`npm run installer:linux`.

### Testing the result

- **AppImage**: `chmod +x *.AppImage && ./*.AppImage`
- **deb**: `sudo apt install ./*.deb` (or `dpkg -i` + `apt --fix-broken install`)
- **rpm**: `sudo rpm -i *.rpm` (Fedora/RHEL-based distro, or `alien` to
  convert for testing on Debian-based ones)

If you have both an Ubuntu and a Fedora-family WSL distro installed, that
conveniently covers testing the deb and rpm outputs on real package
managers without needing separate VMs.

A bare/minimal WSL distro (one you only used for building, never `apt
install`ed desktop packages into) is missing runtime libraries a real
desktop already has — running the AppImage directly will fail with
`error loading libfuse.so.2` (no FUSE) or, after
`--appimage-extract-and-run`, `error while loading shared libraries:
libnspr4.so` (missing NSS/GTK libs — the same ones the `.deb` declares
under `Depends:`). Neither is a packaging bug; `sudo apt install ./*.deb`
pulls in everything the app actually needs.

---

## macOS

The `electron-builder` config already targets `dmg` (`build.mac.target` in
`package.json`), but **this repository cannot build it** — Apple's
toolchain (Xcode Command Line Tools, `codesign`) only runs on macOS, and
Electron's macOS framework signing/bundling steps don't work when
cross-built from Windows or Linux.

To produce a macOS build, you need an actual Mac (or a macOS CI runner,
e.g. GitHub Actions' `macos-latest`):

```bash
npm install
cd backend && pip install -r requirements.txt && cd ..
npm run build
npx electron-builder --mac dmg --publish never
```

Without an Apple Developer ID certificate + notarization, the resulting
`.dmg` will be blocked by Gatekeeper as "from an unidentified developer" —
worse friction than Windows SmartScreen, since there's no click-through by
default (users have to right-click → Open, or run
`xattr -cr "Pretty Policy Analyzer.app"`). Signing requires an Apple
Developer Program membership ($99/year) plus `CSC_LINK` /
`CSC_KEY_PASSWORD` environment variables for `electron-builder`.

A macOS `.icns` icon also still needs to be generated and wired into
`build.mac.icon` — this hasn't been done yet since the config was never
exercised.

---

## Known limitations

- **RSoP import (`gpresult`) only works on Windows** — the backend already
  raises a clean error on other platforms rather than crashing
  (`backend/app/parsers/gpresult_parser.py`), but the feature itself is
  inherently Windows-only (it shells out to `gpresult.exe`).
- **No CI job builds Linux/macOS yet** — `.github/workflows/build.yml`
  currently only compiles the frontend and import-checks the backend; it
  doesn't run `electron-builder` for any platform. Extending it with a
  release matrix (`windows-latest` / `ubuntu-latest` / `macos-latest`) is
  the natural next step once these builds are validated locally.
