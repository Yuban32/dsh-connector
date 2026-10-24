export interface RpcEnvelope {
    v: number;
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
}
export interface RpcResult {
    result?: unknown;
    error?: {
        code: string;
        message: string;
    };
}
export type RpcMethod = (params: Record<string, unknown>, identity: string) => Promise<unknown>;
export type RpcRouter = (method: string, params: Record<string, unknown>, identity: string) => Promise<unknown>;
export declare class RpcError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function decodeEnvelope(body: Buffer): RpcEnvelope;
export declare function encodeOk(id: string | number, result: unknown): Buffer;
export declare function encodeErr(id: string | number, code: string, message: string): Buffer;
/** Dispatch table; method names are plain strings on the single RPC path. */
export declare function createRouter(methods: Record<string, RpcMethod>): RpcRouter;
export declare function errorPayload(error: unknown): {
    code: string;
    message: string;
};
//# sourceMappingURL=rpc.d.ts.map