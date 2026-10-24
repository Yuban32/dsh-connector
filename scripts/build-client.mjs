#!/usr/bin/env node
/**
 * Assemble the harness client bundle: the host's module loader expects an
 * IIFE whose factory receives a sandboxed `require` and exposes
 * `module.exports` — the wrapper below provides both, then inlines our
 * hand-written client source verbatim (it requires react/slots from the
 * platform module table at runtime; nothing to bundle).
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';

const banner = [
  'window.__ModuleLoader__.load({',
  '  id: "@dsh-connector/connector",',
  '  factory: (require) => {',
  '    var module = { exports: {} };',
  '    var exports = module.exports;',
].join('\n');
const footer = '  return module.exports;\n  }\n});';

mkdirSync('dist/client', { recursive: true });
const source = readFileSync('client/index.js', 'utf8');
writeFileSync('dist/client.js', banner + '\n' + source + '\n' + footer);

// Handwritten type surface for `@dsh-connector/connector/client`.
copyFileSync('client/index.d.ts', 'dist/client/index.d.ts');
console.log('client bundle written to dist/client.js');
