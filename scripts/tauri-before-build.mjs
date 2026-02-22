#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.TAURI_SKIP_UI_BUILD === '1') {
  console.log('[tauri-before-build] skip UI build because TAURI_SKIP_UI_BUILD=1');
  process.exit(0);
}

const thisDir = dirname(fileURLToPath(import.meta.url));
const uiDir = resolve(thisDir, '..', 'ui');

const result = spawnSync('npm', ['run', 'build'], {
  cwd: uiDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}
process.exit(1);
