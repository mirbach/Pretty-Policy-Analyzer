import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as net from 'net';
import * as fs from 'fs';
import { app } from 'electron';

let sidecarProcess: ChildProcess | null = null;
let sidecarPort = 8000;

const isDev = !app.isPackaged;

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not get port')));
      }
    });
    server.on('error', reject);
  });
}

async function waitForHealth(port: number, maxWaitMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Backend did not become healthy within ${maxWaitMs}ms`);
}

export async function startSidecar(): Promise<void> {
  sidecarPort = await findFreePort();

  let execPath: string;
  let args: string[];
  let spawnEnv: NodeJS.ProcessEnv;

  if (isDev) {
    // In development, run Python directly
    const backendDir = path.join(__dirname, '..', 'backend');
    const repoRoot = path.join(__dirname, '..');
    execPath = 'python3.13';
    args = ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(sidecarPort)];
    spawnEnv = {
      ...process.env,
      PYTHONPATH: backendDir,
      SECURITY_BASELINES_DIR: path.join(repoRoot, 'SecurityBaselines'),
    };
  } else {
    // In production, run the bundled executable
    const resourcesPath = process.resourcesPath;
    if (process.platform === 'win32') {
      execPath = path.join(resourcesPath, 'gpo-backend', 'gpo-backend.exe');
    } else {
      execPath = path.join(resourcesPath, 'gpo-backend', 'gpo-backend');
    }
    args = ['--port', String(sidecarPort), '--host', '127.0.0.1'];
    spawnEnv = {
      ...process.env,
      SECURITY_BASELINES_DIR: path.join(resourcesPath, 'SecurityBaselines'),
    };
  }

  console.log(`Starting sidecar: ${execPath} ${args.join(' ')}`);

  sidecarProcess = spawn(execPath, args, {
    cwd: isDev ? path.join(__dirname, '..', 'backend') : undefined,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: spawnEnv,
  });

  sidecarProcess.stdout?.on('data', (data) => {
    console.log(`[backend] ${data}`);
  });

  sidecarProcess.stderr?.on('data', (data) => {
    console.error(`[backend] ${data}`);
  });

  sidecarProcess.on('exit', (code) => {
    console.log(`Backend exited with code ${code}`);
    sidecarProcess = null;
  });

  await waitForHealth(sidecarPort);
  console.log(`Backend ready on port ${sidecarPort}`);
}

export function stopSidecar(): void {
  if (sidecarProcess) {
    console.log('Stopping backend...');
    sidecarProcess.kill('SIGTERM');
    // Force kill after timeout
    setTimeout(() => {
      if (sidecarProcess) {
        sidecarProcess.kill('SIGKILL');
      }
    }, 3000);
    sidecarProcess = null;
  }
}

export function getSidecarPort(): number {
  return sidecarPort;
}
