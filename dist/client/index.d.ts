/** Type surface for the harness web-client module (`./client` export). */
export declare const NS: string;
export declare function apply(ctx: {
  slots: {
    inject(slot: string, factory: () => unknown): unknown;
    register(options: Record<string, unknown>, component: unknown): unknown;
  };
  effect(fn: () => unknown, label?: string): unknown;
}): void;
export declare const inject: string[];
