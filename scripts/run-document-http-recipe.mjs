import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(new URL('../firebase.documents-test.json', import.meta.url), 'utf8'));
// Refuse occupied recipe ports; do not stop or reuse the user's local servers.
for (const service of Object.values(config.emulators)) {
  if (!service.port) continue;
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error(`Recipe port ${service.port} unavailable. Stop only the conflicting test server before retrying.`)));
    probe.listen(service.port, '127.0.0.1', () => probe.close(resolve));
  });
}
const child = spawn(process.execPath, [
  fileURLToPath(new URL('../node_modules/firebase-tools/lib/bin/firebase.js', import.meta.url)),
  'emulators:exec', '--config', 'firebase.documents-test.json', '--only', 'auth,firestore,storage',
  '--project', 'demo-sentrys-documents-http', '--non-interactive',
  'node --import tsx --test --experimental-test-isolation=none tests/emulator/document-http-lifecycle.test.mjs',
], { cwd: root, stdio: 'inherit', env: { ...process.env,
  JAVA_TOOL_OPTIONS: `${process.env.JAVA_TOOL_OPTIONS ?? ''} -Duser.language=en -Duser.country=US`.trim(),
} });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
