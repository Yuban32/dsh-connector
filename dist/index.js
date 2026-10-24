import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonFileAtomic } from './storage/json-file.js';
import { asLogger, onDispose } from './context.js';
import { resolveConfig } from './config.js';
import { defaultDataDir } from './paths.js';
import { loadOrCreateHostKeys } from './host/host-keys.js';
import { DeviceVault } from './devices/vault.js';
import { Gate } from './enroll/gate.js';
import { ConsoleServer } from './console/console.js';
import { Diagnostics, diagnosticsFile } from './diagnostics.js';
import { PLUGIN_NAME, PLUGIN_VERSION, OFFER_SCHEME, WIRE_VERSION } from './metadata.js';
import { createRouter, decodeEnvelope, encodeErr, encodeOk, errorPayload, RpcError } from './channel/rpc.js';
import { DirectChannel } from './channel/direct/lan.js';
export { PLUGIN_NAME as name, PLUGIN_VERSION, WIRE_VERSION, OFFER_SCHEME } from './metadata.js';
export { resolveConfig } from './config.js';
export { Gate, GateError } from './enroll/gate.js';
export { DeviceVault } from './devices/vault.js';
export { DirectChannel } from './channel/direct/lan.js';
export { RelayedChannel } from './channel/relayed/stub.js';
export { deriveOfferPsk, deriveDevicePsk } from './enroll/psk.js';
let activeRuntime;
let exitHookInstalled = false;
/**
 * Wire everything together. Kept separate from `apply` so tests and the smoke
 * script can drive a full runtime with ephemeral ports and a temp directory.
 */
export async function createRuntime(config, log) {
    const dataDir = config.dataDir ?? defaultDataDir();
    config.dataDir = dataDir;
    mkdirSync(dataDir, { recursive: true });
    const diagnostics = new Diagnostics(diagnosticsFile(dataDir));
    const hostKeys = loadOrCreateHostKeys(dataDir);
    const vault = DeviceVault.load(dataDir, hostKeys.publicFp);
    const gate = new Gate(vault, hostKeys.publicFp, {
        offerTtlMs: config.offerTtlMs,
        events: { onEvent: (kind, detail) => diagnostics.push(kind, detail) },
    });
    const direct = new DirectChannel({
        port: config.port,
        pskForIdentity: (identity) => gate.pskForIdentity(identity),
        log: (level, message) => log[level](`[direct] ${message}`),
        onClientRejected: (reason) => diagnostics.push('channel.client-rejected', { reason }),
    });
    const router = createRouter({
        'enroll.claim': async (params, identity) => {
            const offerId = requireString(params, 'offerId');
            if (offerId !== identity)
                throw new RpcError('bad-params', 'offerId does not match the channel identity');
            if (!gate.isOfferIdentity(identity))
                throw new RpcError('unknown-offer', 'no open offer for this identity');
            const keyFp = typeof params['keyFp'] === 'string' ? params['keyFp'] : undefined;
            return gate.claim(offerId, String(params['deviceName'] ?? ''), keyFp);
        },
        'enroll.poll': async (params, identity) => {
            const offerId = requireString(params, 'offerId');
            if (offerId !== identity)
                throw new RpcError('bad-params', 'offerId does not match the channel identity');
            return gate.poll(offerId);
        },
        'device.ping': async (_params, identity) => {
            const device = vault.get(identity);
            if (!device)
                throw new RpcError('unknown-device', 'device not registered');
            if (device.state === 'suspended')
                throw new RpcError('device-suspended', 'device access is suspended');
            vault.markSeen(identity);
            return { ok: true, serverTime: new Date().toISOString() };
        },
        'device.suspend': async (_params, identity) => {
            const device = gate.suspend(identity);
            return { deviceId: device.deviceId, state: device.state };
        },
    });
    const handleChannel = async (req) => {
        if (req.path.endsWith('/health')) {
            return { status: 200, body: Buffer.from(JSON.stringify({ ok: true, wire: WIRE_VERSION })) };
        }
        let envelope;
        try {
            envelope = decodeEnvelope(req.body);
        }
        catch (error) {
            const payload = errorPayload(error);
            return { status: 400, body: encodeErr(-1, payload.code, payload.message) };
        }
        try {
            const result = await router(envelope.method, envelope.params ?? {}, req.identity);
            return { status: 200, body: encodeOk(envelope.id, result) };
        }
        catch (error) {
            diagnostics.push('rpc.error', { method: envelope.method, code: errorPayload(error).code });
            const payload = errorPayload(error);
            return { status: 200, body: encodeErr(envelope.id, payload.code, payload.message) };
        }
    };
    await direct.serve(handleChannel);
    const buildUris = (offer) => direct.advertise().map(({ host, port }) => `${OFFER_SCHEME}://l?v=${WIRE_VERSION}&h=${encodeURIComponent(host)}&p=${port}` +
        `&o=${encodeURIComponent(offer.offerId)}&fp=${encodeURIComponent(hostKeys.publicFp)}` +
        `&c=${encodeURIComponent(offer.code)}`);
    const openOffer = () => {
        const offer = gate.openOffer();
        diagnostics.push('console.offer', { offerId: offer.offerId });
        return { offerId: offer.offerId, code: offer.code, expiresAt: offer.expiresAt, uris: buildUris(offer) };
    };
    const confirm = (offerId) => {
        const device = gate.confirm(offerId);
        return { deviceId: device.deviceId, name: device.name };
    };
    const suspend = (deviceId) => {
        const device = gate.suspend(deviceId);
        return { deviceId: device.deviceId, state: device.state };
    };
    const state = () => ({
        plugin: PLUGIN_NAME,
        version: PLUGIN_VERSION,
        hostFp: hostKeys.publicFp,
        direct: {
            status: direct.status,
            port: direct.actualPort(),
            hosts: direct.advertise().map((endpoint) => endpoint.host),
        },
        devices: vault.list().map((device) => ({
            deviceId: device.deviceId,
            name: device.name,
            state: device.state,
            enrolledAt: device.enrolledAt,
            lastSeenAt: device.lastSeenAt,
        })),
        lastError: direct.lastError,
    });
    const consoleServer = new ConsoleServer({ port: config.consolePort, log, state, openOffer, confirm, suspend });
    await consoleServer.start();
    diagnostics.push('runtime.start', { port: direct.actualPort(), consolePort: consoleServer.port });
    const close = async () => {
        diagnostics.push('runtime.stop');
        diagnostics.dispose();
        await consoleServer.close();
        await direct.close();
        if (activeRuntime === handles)
            activeRuntime = undefined;
    };
    const handles = {
        config,
        hostFp: hostKeys.publicFp,
        vault,
        gate,
        direct,
        console: consoleServer,
        diagnostics,
        state,
        openOffer,
        confirm,
        suspend,
        handleChannel,
        close,
    };
    return handles;
}
/** Cordis entry point. The host calls this once per plugin load. */
export async function apply(ctx, cordisConfig) {
    const log = asLogger(ctx);
    const config = resolveConfig(cordisConfig);
    if (!config.enabled) {
        log.info(`${PLUGIN_NAME}: disabled by configuration; nothing started`);
        return;
    }
    if (activeRuntime) {
        log.warn(`${PLUGIN_NAME}: runtime already active; leaving the existing instance in place`);
        return;
    }
    let runtime;
    try {
        runtime = await createRuntime(config, log);
    }
    catch (error) {
        // Activation must always leave evidence on disk, even when the host only
        // surfaces a one-line warning.
        persistActivationError(config, error);
        throw error;
    }
    activeRuntime = runtime;
    log.info(`${PLUGIN_NAME} ${PLUGIN_VERSION}: started (channel port ${runtime.direct.actualPort()})`);
    const cleanup = () => {
        void runtime.close();
    };
    onDispose(ctx, cleanup);
    if (!exitHookInstalled) {
        exitHookInstalled = true;
        process.once('exit', cleanup);
    }
}
/** Best-effort breadcrumb so an opaque "did not activate" always has a cause. */
function persistActivationError(config, error) {
    try {
        const dir = config.dataDir ?? defaultDataDir();
        mkdirSync(dir, { recursive: true });
        writeJsonFileAtomic(join(dir, 'activation-error.json'), {
            v: 1,
            at: new Date().toISOString(),
            error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
        });
    }
    catch {
        // Nothing else to do — the host log is the remaining trail.
    }
}
function requireString(params, key) {
    const value = params[key];
    if (typeof value !== 'string' || value === '')
        throw new RpcError('bad-params', `${key} is required`);
    return value;
}
//# sourceMappingURL=index.js.map