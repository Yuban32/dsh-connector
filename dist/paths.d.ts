/**
 * The host profile root is a pnpm workspace: walking up from this compiled
 * file (`<root>/node_modules/@ds-connector/connector/dist/paths.js`) the first
 * directory holding `pnpm-workspace.yaml` is the profile.
 */
export declare function findProfileRoot(fromDir?: string): string | undefined;
export declare function defaultDataDir(profileRoot?: string): string;
//# sourceMappingURL=paths.d.ts.map