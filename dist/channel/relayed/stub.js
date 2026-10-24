/**
 * Placeholder for the future relayed channel (server-assisted reachability).
 * The intended contract is documented in docs/relayed-channel.md; serving
 * intentionally fails until that design is implemented.
 */
export class RelayedChannel {
    kind = 'relayed';
    status = 'stopped';
    lastError;
    advertise() {
        return [];
    }
    async serve(_handler) {
        this.lastError = 'relayed channel is not implemented yet (see docs/relayed-channel.md)';
        this.status = 'error';
        throw new Error(this.lastError);
    }
    async close() {
        this.status = 'stopped';
    }
}
//# sourceMappingURL=stub.js.map