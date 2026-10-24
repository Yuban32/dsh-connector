import type { ChannelAdapter, ChannelRequest, ChannelResponse, ChannelStatus } from '../types.js';

/**
 * Placeholder for the future relayed channel (server-assisted reachability).
 * The intended contract is documented in docs/relayed-channel.md; serving
 * intentionally fails until that design is implemented.
 */
export class RelayedChannel implements ChannelAdapter {
  readonly kind = 'relayed' as const;
  status: ChannelStatus = 'stopped';
  lastError: string | undefined;

  advertise(): Array<{ host: string; port: number }> {
    return [];
  }

  async serve(_handler: (req: ChannelRequest) => Promise<ChannelResponse>): Promise<void> {
    this.lastError = 'relayed channel is not implemented yet (see docs/relayed-channel.md)';
    this.status = 'error';
    throw new Error(this.lastError);
  }

  async close(): Promise<void> {
    this.status = 'stopped';
  }
}
