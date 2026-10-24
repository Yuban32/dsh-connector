/**
 * Harness web-client module placeholder.
 *
 * Registered through the harness module loader (see scripts/build-client.mjs).
 * v1 intentionally has no UI: it only exposes a state probe for debugging and
 * logs one line on load. All side effects are guarded so a probe failure can
 * never break the host page.
 */
declare const window: Record<string, unknown>;

interface ConsoleProbe {
  getState(): Promise<unknown>;
}

export function activate(): void {
  try {
    const probe: ConsoleProbe = {
      getState: async () => {
        try {
          const response = await fetch('http://127.0.0.1:28471/state');
          return await response.json();
        } catch {
          return null;
        }
      },
    };
    window['__dsConnector'] = probe;
    console.info('[DS Connector] client module ready');
  } catch (error) {
    console.warn('[DS Connector] client module init skipped', error);
  }
}

activate();
