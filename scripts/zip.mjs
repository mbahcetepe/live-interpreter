// Packs dist/ into live-interpreter-<version>.zip, the file a GitHub release carries.
// Uses the zip command where there is one (macOS, Linux) and tar elsewhere (Windows 10 and
// newer ship a tar that writes zip files).
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const out = path.join(root, `live-interpreter-${version}.zip`);
rmSync(out, { force: true });
const dist = path.join(root, 'dist');
try {
  execFileSync('zip', ['-qrX', out, '.', '-x', '.DS_Store'], { cwd: dist, stdio: 'ignore' });
} catch {
  execFileSync('tar', ['-a', '-c', '-f', out, '.'], { cwd: dist, stdio: 'inherit' });
}
console.log(`wrote ${path.relative(root, out)}`);
