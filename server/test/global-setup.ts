import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';

const HOST = '127.0.0.1';
const PORT = 8182;

async function waitUp(timeoutMs: number) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if ((await fetch(`http://${HOST}:${PORT}/`)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Firestore emulator did not start. It needs the gcloud CLI with the cloud-firestore-emulator component, and Java 21+.');
}

/** Starts a throwaway Firestore emulator for the test run (needs gcloud + Java 21). */
export default async function setup() {
  const brewJava = '/opt/homebrew/opt/openjdk@21/bin';
  const env = { ...process.env, PATH: `${existsSync(brewJava) ? `${brewJava}:` : ''}${process.env.PATH}` };
  const child: ChildProcess = spawn('gcloud', ['emulators', 'firestore', 'start', `--host-port=${HOST}:${PORT}`, '--quiet'], { env, detached: true, stdio: 'ignore' });
  child.on('error', (e) => console.error('could not start emulator:', e.message));
  await waitUp(90_000);
  return () => {
    try { process.kill(-child.pid!, 'SIGTERM'); } catch { /* already gone */ }
  };
}
