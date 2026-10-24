export interface DiagnosticEvent {
    t: string;
    kind: string;
    detail?: Record<string, unknown>;
}
/**
 * In-memory ring of recent lifecycle events, flushed to disk (throttled) so a
 * loaded plugin can be inspected even where host logs are silent. Secrets —
 * codes, tokens, PSKs — are never recorded.
 */
export declare class Diagnostics {
    private readonly file?;
    private readonly ring;
    private timer;
    constructor(file?: string | undefined);
    push(kind: string, detail?: Record<string, unknown>): void;
    snapshot(): DiagnosticEvent[];
    flush(): void;
    dispose(): void;
    private scheduleFlush;
}
export declare function diagnosticsFile(dataDir: string): string;
//# sourceMappingURL=diagnostics.d.ts.map