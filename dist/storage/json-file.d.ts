/** Read a JSON file, returning `undefined` for missing or malformed content. */
export declare function readJsonFile<T>(file: string): T | undefined;
/**
 * Atomic JSON write: write to `<file>.tmp` then rename. Windows can throw
 * EPERM when the destination is briefly held open (e.g. by an indexer), so
 * retry once and fall back to a direct overwrite.
 */
export declare function writeJsonFileAtomic(file: string, value: unknown, indent?: number): void;
//# sourceMappingURL=json-file.d.ts.map