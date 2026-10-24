window.__ModuleLoader__.load({
  id: "@ds-connector/connector",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
// DS Connector client module — contributes a "DS Connector" tab into the
// harness Settings → Built-in plugins section (slot: settings.plugins.tab).
// The tab talks to the loopback console (127.0.0.1:28471); loopback http is
// exempt from mixed-content blocking, and the console serves CORS headers.
const react = require('react');
const h = react.createElement;

const CONSOLE = 'http://127.0.0.1:28471';
const NS = 'ds-connector';
const DICT = {
  zh: { title: 'DS Connector 手机入网', status: '运行状态', version: '版本', mode: '信道模式', port: '端口', devices: '已入册设备', none: '暂无设备', refresh: '刷新', offer: '生成入网邀约', revokeTitle: '停用设备', revoke: '停用', confirm: '确认入网', offerCode: '入网码', offerUri: '邀约 URI（手机扫码或粘贴）', copy: '复制', copied: '已复制', err: '无法连接控制台', offerId: '邀约 ID' },
  en: { title: 'DS Connector Phone Enrollment', status: 'Status', version: 'Version', mode: 'Channel mode', port: 'Port', devices: 'Enrolled devices', none: 'No devices yet', refresh: 'Refresh', offer: 'Create enrollment offer', revokeTitle: 'Suspend device', revoke: 'Suspend', confirm: 'Confirm', offerCode: 'Code', offerUri: 'Offer URI (scan or paste on phone)', copy: 'Copy', copied: 'Copied', err: 'Console unreachable', offerId: 'Offer ID' },
};
const t0 = () => (navigator.language || '').toLowerCase().startsWith('zh') ? DICT.zh : DICT.en;

async function call(path, body) {
  const res = await fetch(CONSOLE + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(path + ' -> ' + res.status);
  return res.json();
}

function StatusRow(props) {
  return h('div', { style: { display: 'flex', gap: '8px', fontSize: '13px' } },
    h('span', { style: { color: 'var(--dsw-alias-label-tertiary)', minWidth: '96px' } }, props.label),
    h('span', null, String(props.value)));
}

function DeviceRow(props) {
  const t = props.t;
  const d = props.device;
  const row = { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', border: '0.5px solid var(--dsw-alias-border-l2)', borderRadius: '6px' };
  const name = { fontWeight: 600, fontSize: '13px' };
  const meta = { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' };
  const btn = { cursor: 'pointer', marginLeft: 'auto', fontSize: '12px', padding: '4px 10px' };
  return h('div', { style: row },
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
      h('span', { style: name }, d.name),
      h('span', { style: meta }, d.deviceId + ' · ' + d.state)),
    h('button', {
      style: btn,
      disabled: d.state !== 'enrolled',
      onClick: async () => {
        try { await call('/suspend', { deviceId: d.deviceId }); props.onChange(); } catch (e) { props.onError(e); }
      },
    }, t('revoke')));
}

function TabComponent() {
  const t = t0();
  const [state, setState] = react.useState(null);
  const [offer, setOffer] = react.useState(null);
  const [error, setError] = react.useState('');
  const [copied, setCopied] = react.useState('');
  const refresh = () => call('/state').then((s) => { setState(s); setError(''); }).catch((e) => setError(String(e)));
  react.useEffect(() => { refresh(); const id = setInterval(refresh, 15000); return () => clearInterval(id); }, []);

  const card = { display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '760px' };
  const box = { border: '0.5px solid var(--dsw-alias-border-l2)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' };
  const primary = { cursor: 'pointer', alignSelf: 'flex-start', padding: '6px 14px' };
  const mono = { fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all', whiteSpace: 'pre-wrap' };

  return h('div', { style: card },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
      h('button', { style: primary, onClick: () => refresh() }, t('refresh')),
      h('button', {
        style: primary,
        disabled: !state || state.direct?.status !== 'ready',
        onClick: async () => {
          try { setOffer(await call('/offer', {})); setError(''); } catch (e) { setError(String(e)); }
        },
      }, t('offer')),
      error ? h('span', { style: { color: 'var(--dsw-alias-state-danger, #c00)', fontSize: '12px' } }, t('err') + ': ' + error) : null),
    state ? h('div', { style: box },
      h(StatusRow, { label: t('version'), value: state.version }),
      h(StatusRow, { label: t('status'), value: state.direct?.status }),
      h(StatusRow, { label: t('mode'), value: state.direct?.mode }),
      h(StatusRow, { label: t('port'), value: state.direct?.port })) : null,
    offer ? h('div', { style: box },
      h(StatusRow, { label: t('offerCode'), value: offer.code }),
      h(StatusRow, { label: t('offerId'), value: offer.offerId }),
      h('div', null,
        h('div', { style: { fontSize: '12px', marginBottom: '4px' } }, t('offerUri')),
        h('textarea', {
          readOnly: true, style: { ...mono, width: '100%', height: '72px' }, value: offer.uris.join('\n'),
          onClick: (e) => e.target.select(),
        }),
        h('button', {
          style: { ...primary, marginTop: '6px' },
          onClick: async () => {
            try { await navigator.clipboard.writeText(offer.uris.join('\n')); setCopied(t('copied')); setTimeout(() => setCopied(''), 1500); } catch { /* clipboard unavailable */ }
          },
        }, copied || t('copy')))) : null,
    h('div', null,
      h('div', { style: { fontWeight: 600, fontSize: '14px', margin: '4px 0' } }, t('devices')),
      !state || state.devices.length === 0 ? h('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '13px' } }, t('none')) :
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
          state.devices.map((d) => h(DeviceRow, { key: d.deviceId, device: d, t, onChange: refresh, onError: (e) => setError(String(e)) })))),
  );
}

function apply(ctx) {
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'ds-connector',
    order: 200,
    label: () => 'DS Connector',
  }, TabComponent));
}

const inject = [];
exports.apply = apply;
exports.inject = inject;

  return module.exports;
});