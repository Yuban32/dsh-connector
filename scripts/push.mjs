#!/usr/bin/env node
/**
 * Build + reinstall into the harness profile, using the harness's own pnpm.
 *
 * The install is a `link:` — the profile references this repo in place, so a
 * code change only needs a rebuild (this script), never a reinstall:
 *
 *   pnpm push          # build + (re)link, then restart the harness app
 *
 * The harness location is auto-detected; override with DSC_HARNESS_DIR.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const profileDir = join(homedir(), '.dsh', 'profiles', 'desktop');
const PKG_NAME = '@ds-connector/connector';

const harnessCandidates = [
  process.env['DSC_HARNESS_DIR'],
  'J:/Development/Program Files/Deepseek Harness',
  'C:/Program Files/Deepseek Harness',
  'C:/Program Files (x86)/Deepseek Harness',
].filter(Boolean);

function harnessPnpm() {
  for (const base of harnessCandidates) {
    const pnpm = join(base, 'resources', 'runtime', 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.cjs');
    if (existsSync(pnpm)) return pnpm;
  }
  return undefined;
}

function run(cmd, args, opts = {}) {
  // .cmd/.bat shims require shell mode on Windows (Node >= 18.20 spawns them
  // with EINVAL otherwise).
  const needsShell = process.platform === 'win32' && /\.cmd$/i.test(cmd);
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: needsShell, ...opts });
  if (result.status !== 0) {
    console.error(`\n[push] command failed (exit ${result.status}): ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(profileDir)) {
  console.error(`[push] harness profile not found: ${profileDir}`);
  process.exit(1);
}

// The harness UI records an uninstall/disable as a `disabled: true` patch
// entry for our plugin record id in the profile's cordis.patch.yml. Respect
// that decision: re-registering the bundle here would silently resurrect an
// entry the user explicitly removed (the UI does not live-unload web entries,
// so a resurrected tab only becomes visible after a restart — very confusing).
const patchFile = join(profileDir, 'cordis.patch.yml');
const patchText = existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : '';
const disabledEntry = patchText
  .split(/^- /m)
  .slice(1)
  .some((entry) => /id:\s*['"]?ds-connector\b/.test(entry) && /disabled:\s*true/.test(entry));
if (disabledEntry && process.env['DSC_PUSH_FORCE'] !== '1') {
  console.error('[push] profile patch marks "ds-connector" disabled — the plugin was uninstalled');
  console.error('[push] or disabled in the harness UI. Reinstalling would undo that decision.');
  console.error('[push] re-enable it in the UI (or drop the disabled entry from the profile');
  console.error('[push] cordis.patch.yml), or run with DSC_PUSH_FORCE=1 to push anyway.');
  process.exit(1);
}

console.log('[push] 1/2 building...');
run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['build'], { cwd: projectDir });

const pnpm = harnessPnpm();
console.log(`[push] 2/2 reinstalling into profile (${pnpm ? 'harness pnpm' : 'system pnpm'})...`);
if (pnpm) {
  run(process.execPath, [pnpm, 'add', `link:${projectDir}`], { cwd: profileDir });
} else {
  console.warn('[push] harness pnpm not found — falling back to system pnpm (store-version conflicts are likely).');
  console.warn('[push] set DSC_HARNESS_DIR to your harness install dir to use the bundled pnpm.');
  run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['add', `link:${projectDir}`], { cwd: profileDir });
}

// Keep the bundle registered: installs from other sources (GitHub URL, UI)
// can drop our entry from dsh.profile.bundles; push always restores it.
const pkgFile = join(profileDir, 'package.json');
const profilePkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
const bundles = profilePkg?.dsh?.profile?.bundles;
if (Array.isArray(bundles) && !bundles.includes(PKG_NAME)) {
  bundles.push(PKG_NAME);
  writeFileSync(pkgFile, JSON.stringify(profilePkg, null, 2) + '\n');
  console.log(`[push] re-registered ${PKG_NAME} in dsh.profile.bundles`);
}

console.log('\n[push] done. Restart the DeepSeek Harness app to load the new build,');
console.log('[push] then verify: curl http://127.0.0.1:28471/state  (or: pnpm smoke)');
console.log('[push] if the entry shows disabled in the UI, enable it there once.');
