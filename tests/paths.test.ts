import { deepStrictEqual } from 'node:assert';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { defaultDataDir, installedProfileRoot } from '../dist/paths.js';

function tempHome(tag: string): string {
  return join(tmpdir(), `dsc-paths-${tag}-${process.pid}-${Date.now()}`);
}

test('installedProfileRoot finds the profile holding this package', () => {
  const home = tempHome('hit');
  const profile = join(home, '.dsh', 'profiles', 'desktop');
  mkdirSync(join(profile, 'node_modules', '@ds-connector', 'connector'), { recursive: true });
  try {
    deepStrictEqual(installedProfileRoot(home), profile);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('installedProfileRoot returns undefined when nothing is installed', () => {
  const home = tempHome('miss');
  mkdirSync(join(home, '.dsh', 'profiles'), { recursive: true });
  try {
    deepStrictEqual(installedProfileRoot(home), undefined);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('installedProfileRoot tolerates a missing profiles directory', () => {
  deepStrictEqual(installedProfileRoot(tempHome('no-dir')), undefined);
});

test('defaultDataDir honours an explicit profile root', () => {
  const root = join('X:', 'profiles', 'foo');
  deepStrictEqual(defaultDataDir(root), join(root, '.ds-connector', 'vault-v1'));
});
