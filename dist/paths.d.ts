/**
 * The host profile root is a pnpm workspace: walking up from this compiled
 * file (`<root>/node_modules/@ds-connector/connector/dist/paths.js`) the first
 * directory holding `pnpm-workspace.yaml` is the profile.
 *
 * That walk fails under symlinked installs (`link:` resolves `import.meta.url`
 * to the repo checkout, which sits outside any workspace), so callers should
 * fall back to {@link installedProfileRoot} before giving up.
 */
export declare function findProfileRoot(fromDir?: string): string | undefined;
/**
 * First `~/.dsh/profiles/<name>` that has this package in its node_modules
 * (matches copied and symlinked installs alike).
 */
export declare function installedProfileRoot(home?: string): string | undefined;
export declare function defaultDataDir(profileRoot?: string): string;
//# sourceMappingURL=paths.d.ts.map