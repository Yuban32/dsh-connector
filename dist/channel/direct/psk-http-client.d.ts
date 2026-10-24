export interface PskEndpoint {
    host: string;
    port: number;
    identity: string;
    /** Present = PSK mode; absent = certificate mode (standard TLS, unverified cert). */
    psk?: Buffer;
}
export interface PskHttpResponse {
    status: number;
    body: Buffer;
}
/** One-shot request: write by hand, read to EOF (server closes; length known). */
export declare function pskRequest(endpoint: PskEndpoint, path: string, body?: Buffer, timeoutMs?: number): Promise<PskHttpResponse>;
//# sourceMappingURL=psk-http-client.d.ts.map