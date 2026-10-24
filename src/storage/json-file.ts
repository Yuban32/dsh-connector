import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

/** Read a JSON file, returning `undefined` for missing or malformed content. */
export function readJsonFile<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

/**
 * Atomic JSON write: write to `<file>.tmp` then rename. Windows can throw
 * EPERM when the destination is briefly held open (e.g. by an indexer), so
 * retry once and fall back to a direct overwrite.
 */
export function writeJsonFileAtomic(file: string, value: unknown, indent?: number): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const payload = JSON.stringify(value, null, indent);
  try {
    writeFileSync(tmp, payload, { mode: 0o600 });
    try {
      renameSync(tmp, file);
      return;
    } catch (error) {
      if (!isEperm(error)) throw error;
      // Fall through to the direct overwrite after a short pause.
      busyPause(50);
    }
  } catch {
    // tmp write/rename problems fall through to the direct overwrite below.
  }
  writeFileSync(file, payload, { mode: 0o600 });
}

function isEperm(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'EPERM';
}

/** Real (non-busy) main-thread sleep, only used on the rare EPERM retry path. */
function busyPause(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    // Very old runtimes without SharedArrayBuffer: skip the pause.
  }
}
