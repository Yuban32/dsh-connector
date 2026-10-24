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
/**
 * Precedence: Cordis node config > `DSC_*` environment variables > defaults.
 * The Cordis config object arrives as the second `apply` argument and can be
 * set per-node from the profile's patch layer.
 */
export declare function resolveConfig(cordisConfig?: Partial<DscConfig>, env?: NodeJS.ProcessEnv): DscConfig;
//# sourceMappingURL=config.d.ts.map