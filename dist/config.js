import { hostname } from 'node:os';
import { DEFAULT_CONSOLE_PORT, DEFAULT_OFFER_TTL_MS, DEFAULT_PORT } from './metadata.js';
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
function readNumber(env, key) {
    const raw = env[key];
    if (raw === undefined || raw.trim() === '')
        return undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
}
function readLogLevel(env, key) {
    const raw = env[key];
    return LOG_LEVELS.includes(raw) ? raw : undefined;
}
function readBool(env, key) {
    const raw = env[key];
    if (raw === undefined)
        return undefined;
    const normalized = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized))
        return true;
    if (['0', 'false', 'no', 'off'].includes(normalized))
        return false;
    return undefined;
}
/**
 * Precedence: Cordis node config > `DSC_*` environment variables > defaults.
 * The Cordis config object arrives as the second `apply` argument and can be
 * set per-node from the profile's patch layer.
 */
export function resolveConfig(cordisConfig, env = process.env) {
    const defaults = {
        enabled: true,
        port: DEFAULT_PORT,
        consolePort: DEFAULT_CONSOLE_PORT,
        offerTtlMs: DEFAULT_OFFER_TTL_MS,
        hostName: hostname(),
        logLevel: 'info',
    };
    const fromEnv = {
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
function definedEntries(input) {
    const out = {};
    for (const [key, value] of Object.entries(input)) {
        if (value !== undefined)
            out[key] = value;
    }
    return out;
}
//# sourceMappingURL=config.js.map