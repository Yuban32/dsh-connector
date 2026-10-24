import { join } from 'node:path';

import { writeJsonFileAtomic } from './storage/json-file.js';

export interface DiagnosticEvent {
  t: string;
  kind: string;
  detail?: Record<string, unknown>;
}

const RING_SIZE = 200;
const FLUSH_DELAY_MS = 2000;

/**
 * In-memory ring of recent lifecycle events, flushed to disk (throttled) so a
 * loaded plugin can be inspected even where host logs are silent. Secrets —
 * codes, tokens, PSKs — are never recorded.
 */
export class Diagnostics {
  private readonly ring: DiagnosticEvent[] = [];
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly file?: string) {}

  push(kind: string, detail?: Record<string, unknown>): void {
    this.ring.push({ t: new Date().toISOString(), kind, detail });
    if (this.ring.length > RING_SIZE) this.ring.shift();
    this.scheduleFlush();
  }

  snapshot(): DiagnosticEvent[] {
    return [...this.ring];
  }

  flush(): void {
    if (!this.file) return;
    try {
      writeJsonFileAtomic(this.file, { events: this.snapshot() });
    } catch {
      // Diagnostics must never take the plugin down.
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.flush();
  }

  private scheduleFlush(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, FLUSH_DELAY_MS);
    this.timer.unref();
  }
}

export function diagnosticsFile(dataDir: string): string {
  return join(dataDir, 'diagnostics.json');
}
