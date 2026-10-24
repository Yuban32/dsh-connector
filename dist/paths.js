import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * The host profile root is a pnpm workspace: walking up from this compiled
 * file (`<root>/node_modules/@ds-connector/connector/dist/paths.js`) the first
 * directory holding `pnpm-workspace.yaml` is the profile.
 */
export function findProfileRoot(fromDir = dirname(fileURLToPath(import.meta.url))) {
    let current = fromDir;
    for (;;) {
        if (existsSync(join(current, 'pnpm-workspace.yaml')))
            return current;
        const parent = dirname(current);
        if (parent === current)
            return undefined;
        current = parent;
    }
}
export function defaultDataDir(profileRoot) {
    const base = profileRoot ?? findProfileRoot() ?? homedir();
    return join(base, '.ds-connector', 'vault-v1');
}
//# sourceMappingURL=paths.js.map