import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

// The harness web client loads plugin bundles through a global module loader;
// the wrapper below is the registration shape it expects.
const banner = 'window.__ModuleLoader__.load({ id: "@ds-connector/connector", factory: (require) => {';
const footer = '});';

mkdirSync('dist', { recursive: true });
await build({
  entryPoints: ['client/index.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  outfile: 'dist/client.js',
  banner: { js: banner },
  footer: { js: footer },
  logLevel: 'info',
});
console.log('client bundle written to dist/client.js');
