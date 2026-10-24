export interface PskEndpoint {
    host: string;
    port: number;
    identity: string;
    psk: Buffer;
}
export interface PskHttpResponse {
    status: number;
    body: Buffer;
}
/**
 * Minimal HTTP/1.1 exchange over a TLS-PSK connection, used by the smoke
 * script and tests to play the phone side.
 *
 * The request is written by hand onto the secured socket and the response is
 * read to EOF: the channel always replies with an explicit content-length and
 * we always send `Connection: close`, so one read loop covers every response.
 * Node's own http client is not used here — its agent plumbing is hard to pin
 * to a pre-built TLS socket.
 */
export declare function pskRequest(endpoint: PskEndpoint, path: string, body?: Buffer, timeoutMs?: number): Promise<PskHttpResponse>;
//# sourceMappingURL=psk-http-client.d.ts.map