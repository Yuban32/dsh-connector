/**
 * A narrow, structural view of the host context.
 *
 * The plugin is built and tested without the host framework on disk: the
 * framework resolves its own bundled modules at runtime and only ever calls
 * `apply(ctx, config)`. Every field here is optional so plain objects work in
 * tests, and nothing in this package imports the host framework.
 */

export interface DscLogger {
  debug(...parts: unknown[]): void;
  info(...parts: unknown[]): void;
  warn(...parts: unknown[]): void;
  error(...parts: unknown[]): void;
}

export interface DscPluginContext {
  baseUrl?: string;
  logger?: DscLogger;
  /** Host cleanup hook, when present. Best effort — never throws here. */
  effect?(callback: () => unknown): unknown;
}

export function asLogger(ctx: DscPluginContext | undefined, fallback: DscLogger = console): DscLogger {
  return ctx?.logger ?? fallback;
}

/** Register cleanup with the host when possible; always safe to call. */
export function onDispose(ctx: DscPluginContext | undefined, cleanup: () => void): void {
  try {
    ctx?.effect?.(() => cleanup());
  } catch {
    // Cleanup hook shape is host-defined; fall through to the process hook.
  }
}
