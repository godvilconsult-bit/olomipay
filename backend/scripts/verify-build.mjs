/**
 * Fail the build when it produced no entrypoint.
 *
 * The build script deliberately tolerates type errors (`--noEmitOnError false
 * || true`) so a stray type complaint cannot block a deploy. But that `|| true`
 * also swallowed the case where tsc emitted *nothing*: the build reported
 * success, the container started, and only then crashed with
 *
 *     Error: Cannot find module '/app/dist/index.js'
 *
 * which is how a green build took the API down. Type errors stay tolerated; a
 * missing entrypoint does not.
 */
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const entry = path.join(process.cwd(), 'dist', 'index.js');

if (!existsSync(entry)) {
  console.error('\n[build] FAILED: no dist/index.js was produced.');
  console.error('[build] tsc emitted nothing — the container would start and immediately crash.');
  console.error('[build] Run `npx tsc --noEmit --skipLibCheck` to see what is wrong.\n');
  process.exit(1);
}

// An empty file would satisfy existsSync but still fail at require time.
if (statSync(entry).size === 0) {
  console.error('\n[build] FAILED: dist/index.js is empty.\n');
  process.exit(1);
}

console.log('[build] ok — dist/index.js present');
