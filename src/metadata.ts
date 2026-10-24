/** Stable identifiers for the DS Connector plugin and its wire protocol. */

/** Cordis diagnostic label (the plugin's `name` export). */
export const PLUGIN_NAME = 'DS Connector';

export const PLUGIN_VERSION = '0.1.4';

/** Version of the enrollment/device wire protocol spoken on the channel. */
export const WIRE_VERSION = 1;

/** Custom URI scheme used to carry enrollment offers to the phone. */
export const OFFER_SCHEME = 'dsconnect';

export const DEFAULT_PORT = 28470;
export const DEFAULT_CONSOLE_PORT = 28471;
export const DEFAULT_OFFER_TTL_MS = 5 * 60 * 1000;
