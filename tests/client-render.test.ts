import { deepStrictEqual, ok } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import react from 'react';
import { renderToString } from 'react-dom/server';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

interface LoadedClient {
  exports: Record<string, unknown>;
  fetchCalls: Array<{ path: string; body: unknown }>;
}

/**
 * Loads the raw client module body the same way the host's module-loader
 * wrapper does, with `react` resolved for real and `fetch` recorded instead
 * of hitting the loopback console.
 */
function loadClient(): LoadedClient {
  const src = readFileSync(join(ROOT, 'client', 'index.js'), 'utf8');
  const fetchCalls: LoadedClient['fetchCalls'] = [];
  const module = { exports: {} as Record<string, unknown> };
  const load = new Function('require', 'module', 'exports', 'fetch', 'navigator', src) as (
    ...args: unknown[]
  ) => void;
  load(
    (spec: string) => {
      if (spec === 'react') return react;
      throw new Error(`unexpected require in test: ${spec}`);
    },
    module,
    module.exports,
    async (path: string, init?: { body?: string }) => {
      fetchCalls.push({ path, body: init?.body === undefined ? undefined : JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({}) };
    },
    { language: 'zh-CN' },
  );
  return { exports: module.exports, fetchCalls };
}

interface SlotsHarness {
  injected: string[];
  registered: Array<{ options: Record<string, unknown>; component: unknown }>;
}

/** A stand-in for the host slot service: registers immediately, records all. */
function makeSlots(): {
  injected: string[];
  registered: Array<{ options: Record<string, unknown>; component: unknown }>;
  face: {
    inject: (name: string, cb: () => void) => void;
    register: (options: Record<string, unknown>, component: unknown) => void;
    onEntryError: (fn: (...args: unknown[]) => void) => void;
  };
} {
  const injected: string[] = [];
  const registered: Array<{ options: Record<string, unknown>; component: unknown }> = [];
  return {
    injected,
    registered,
    face: {
      inject: (name, cb) => {
        injected.push(name);
        cb();
      },
      register: (options, component) => registered.push({ options, component }),
      onEntryError: (fn) => {
        crashSink = fn;
      },
    },
  };
}

let crashSink: ((...args: unknown[]) => void) | undefined;

function applyWith(mod: Record<string, unknown>, face: ReturnType<typeof makeSlots>['face']): void {
  (mod as { apply: (ctx: unknown) => void }).apply({ slots: face });
}

test('apply registers the tab into declared slots', () => {
  const { exports: mod } = loadClient();
  const slots = makeSlots();
  applyWith(mod, slots.face);
  deepStrictEqual([...slots.injected].sort(), ['plugins.tab', 'settings.plugins.tab']);
  ok(slots.registered.length >= 1);
  const first = slots.registered[0];
  deepStrictEqual(first.options.name, 'settings.plugins.tab');
  deepStrictEqual(first.options.id, 'ds-connector');
});

test('TabComponent renders a populated panel without throwing', () => {
  const { exports: mod } = loadClient();
  const slots = makeSlots();
  applyWith(mod, slots.face);
  const component = slots.registered[0].component;
  ok(typeof component === 'function');
  const html = renderToString(react.createElement(component as react.ComponentType));
  ok(html.includes('刷新'), 'refresh button missing');
  ok(html.includes('生成入网邀约'), 'offer button missing');
  ok(html.includes('暂无设备'), 'empty-devices row missing');
});

test('apply forwards settings.plugins.tab entry crashes to the console', () => {
  const { exports: mod, fetchCalls } = loadClient();
  const slots = makeSlots();
  applyWith(mod, slots.face);
  ok(typeof crashSink === 'function');
  crashSink!('settings.plugins.tab', {}, new Error('boom'));
  crashSink!('other.slot', {}, new Error('ignored'));
  deepStrictEqual(fetchCalls.length, 1);
  ok(fetchCalls[0].path.endsWith('/client-error'));
  deepStrictEqual((fetchCalls[0].body as { message: string }).message, 'boom');
});
