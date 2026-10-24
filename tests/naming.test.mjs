#!/usr/bin/env node
/**
 * Clean-room guard: the repository must never contain the reference product's
 * name, nor its distinctive identifiers. Runs on every `pnpm test`.
 *
 * This file itself is the only place the forbidden fragments appear; it is
 * excluded from the scan.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCAN_DIRS = ['src', 'client', 'scripts', 'tests', 'docs'];
const SCAN_FILES = ['package.json', 'README.md', 'cordis.patch.yml'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.test', '.git', '.claude']);

// Fragments are assembled at runtime so this source file never matches itself.
const FORBIDDEN = [
  ['dsh' + 'os', false],
  ['os[-_ ]?link', true],
  ['pair' + 'ingId', false],
  ['connect' + 'ionGeneration', false],
  ['connect' + 'ionToken', false],
  ['mobile' + 'PublicKey', false],
  ['cloud-pair' + 'ing', false],
  ['246' + '90', false],
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

function repoFiles() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    try {
      files.push(...walk(join(ROOT, dir)));
    } catch {
      // Directory not created yet (early milestones): nothing to scan.
    }
  }
  for (const file of SCAN_FILES) files.push(join(ROOT, file));
  return files.filter((file) => {
    const rel = relative(ROOT, file);
    return rel !== join('tests', 'naming.test.mjs');
  });
}

test('repository is free of reference-product naming', () => {
  const offenders = [];
  for (const file of repoFiles()) {
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const [pattern, isRegex] of FORBIDDEN) {
      const matcher = isRegex ? new RegExp(pattern, 'i') : pattern.toLowerCase();
      const hit = isRegex ? matcher.test(content) : content.toLowerCase().includes(matcher);
      if (hit) offenders.push(`${relative(ROOT, file)}: contains forbidden fragment /${pattern}/i`);
    }
  }
  if (offenders.length > 0) {
    throw new Error(`clean-room naming violation(s):\n${offenders.join('\n')}`);
  }
});

test('scan actually covered repository content', () => {
  if (statSync(join(ROOT, 'src')).isDirectory() === false) {
    throw new Error('src/ missing');
  }
  const seen = repoFiles();
  if (seen.length < 3) throw new Error(`guard scanned too few files (${seen.length})`);
});
