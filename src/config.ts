import { hostname } from 'node:os';

import { DEFAULT_CONSOLE_PORT, DEFAULT_OFFER_TTL_MS, DEFAULT_PORT } from './metadata.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DscConfig {
  enabled: boolean;
  port: number;
  consolePort: number;
  offerTtlMs: number;
  hostName: string;
  /** Explicit data directory; defaults to `<profile root>/.ds-connector/vault-v1`. */
  dataDir?: string;
  logLevel: LogLevel;
}

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

function readNumber(env: NodeJS.ProcessEnv, key: string): number | undefined {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readLogLevel(env: NodeJS.ProcessEnv, key: string): LogLevel | undefined {
  const raw = env[key];
  return LOG_LEVELS.includes(raw as LogLevel) ? (raw as LogLevel) : undefined;
}

function readBool(env: NodeJS.ProcessEnv, key: string): boolean | undefined {
  const raw = env[key];
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

/**
 * Precedence: Cordis node config > `DSC_*` environment variables > defaults.
 * The Cordis config object arrives as the second `apply` argument and can be
 * set per-node from the profile's patch layer.
 */
export function resolveConfig(cordisConfig?: Partial<DscConfig>, env: NodeJS.ProcessEnv = process.env): DscConfig {
  const defaults: DscConfig = {
    enabled: true,
    port: DEFAULT_PORT,
    consolePort: DEFAULT_CONSOLE_PORT,
    offerTtlMs: DEFAULT_OFFER_TTL_MS,
    hostName: hostname(),
    logLevel: 'info',
  };
  const fromEnv: Partial<DscConfig> = {
    enabled: readBool(env, 'DSC_ENABLED'),
    port: readNumber(env, 'DSC_PORT'),
    consolePort: readNumber(env, 'DSC_CONSOLE_PORT'),
    offerTtlMs: readNumber(env, 'DSC_OFFER_TTL_MS'),
    hostName: env['DSC_HOST_NAME']?.trim() || undefined,
    dataDir: env['DSC_DATA_DIR']?.trim() || undefined,
    logLevel: readLogLevel(env, 'DSC_LOG_LEVEL'),
  };
  return {
    ...defaults,
    ...definedEntries(fromEnv),
    ...definedEntries(cordisConfig ?? {}),
  };
}

function definedEntries<T extends object>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}
