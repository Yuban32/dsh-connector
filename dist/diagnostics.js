import { join } from 'node:path';
import { writeJsonFileAtomic } from './storage/json-file.js';
const RING_SIZE = 200;
const FLUSH_DELAY_MS = 2000;
/**
 * In-memory ring of recent lifecycle events, flushed to disk (throttled) so a
 * loaded plugin can be inspected even where host logs are silent. Secrets —
 * codes, tokens, PSKs — are never recorded.
 */
export class Diagnostics {
    file;
    ring = [];
    timer;
    constructor(file) {
        this.file = file;
    }
    push(kind, detail) {
        this.ring.push({ t: new Date().toISOString(), kind, detail });
        if (this.ring.length > RING_SIZE)
            this.ring.shift();
        this.scheduleFlush();
    }
    snapshot() {
        return [...this.ring];
    }
    flush() {
        if (!this.file)
            return;
        try {
            writeJsonFileAtomic(this.file, { events: this.snapshot() });
        }
        catch {
            // Diagnostics must never take the plugin down.
        }
    }
    dispose() {
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = undefined;
        this.flush();
    }
    scheduleFlush() {
        if (!this.file || this.timer)
            return;
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.flush();
        }, FLUSH_DELAY_MS);
        this.timer.unref();
    }
}
export function diagnosticsFile(dataDir) {
    return join(dataDir, 'diagnostics.json');
}
//# sourceMappingURL=diagnostics.js.map