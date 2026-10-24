import { deepStrictEqual } from 'node:assert';
import { test } from 'node:test';

import { resolveConfig } from '../dist/config.js';

test('defaults apply when nothing is set', () => {
  const config = resolveConfig(undefined, {});
  deepStrictEqual(config.enabled, true);
  deepStrictEqual(config.port, 28470);
  deepStrictEqual(config.consolePort, 28471);
  deepStrictEqual(config.offerTtlMs, 300_000);
  deepStrictEqual(config.logLevel, 'info');
});

test('environment overrides defaults', () => {
  const config = resolveConfig(undefined, {
    DSC_PORT: '30000',
    DSC_LOG_LEVEL: 'debug',
    DSC_ENABLED: 'false',
    DSC_DATA_DIR: 'C:/tmp/dsc',
  });
  deepStrictEqual(config.port, 30000);
  deepStrictEqual(config.logLevel, 'debug');
  deepStrictEqual(config.enabled, false);
  deepStrictEqual(config.dataDir, 'C:/tmp/dsc');
});

test('cordis config wins over environment', () => {
  const config = resolveConfig({ port: 31000, hostName: 'node-config-host' }, { DSC_PORT: '30000' });
  deepStrictEqual(config.port, 31000);
  deepStrictEqual(config.hostName, 'node-config-host');
});

test('invalid values fall back to defaults', () => {
  const config = resolveConfig(undefined, { DSC_PORT: 'not-a-number', DSC_ENABLED: 'sometimes', DSC_OFFER_TTL_MS: '-5' });
  deepStrictEqual(config.port, 28470);
  deepStrictEqual(config.enabled, true);
  deepStrictEqual(config.offerTtlMs, 300_000);
});
