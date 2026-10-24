import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The host profile root is a pnpm workspace: walking up from this compiled
 * file (`<root>/node_modules/@dsh-connector/connector/dist/paths.js`) the first
 * directory holding `pnpm-workspace.yaml` is the profile.
 *
 * That walk fails under symlinked installs (`link:` resolves `import.meta.url`
 * to the repo checkout, which sits outside any workspace), so callers should
 * fall back to {@link installedProfileRoot} before giving up.
 */
export function findProfileRoot(fromDir = dirname(fileURLToPath(import.meta.url))): string | undefined {
  let current = fromDir;
  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/**
 * First `~/.dsh/profiles/<name>` that has this package in its node_modules
 * (matches copied and symlinked installs alike).
 */
export function installedProfileRoot(home: string = homedir()): string | undefined {
  const profilesDir = join(home, '.dsh', 'profiles');
  if (!existsSync(profilesDir)) return undefined;
  for (const entry of readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(profilesDir, entry.name);
    if (existsSync(join(candidate, 'node_modules', '@dsh-connector', 'connector'))) return candidate;
  }
  return undefined;
}

export function defaultDataDir(profileRoot?: string): string {
  const base = profileRoot ?? findProfileRoot() ?? installedProfileRoot() ?? homedir();
  return join(base, '.ds-connector', 'vault-v1');
}
