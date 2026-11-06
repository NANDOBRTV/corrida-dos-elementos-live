import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

function watchdog() {
  // Evaluate only the pure watchdog helper. Importing studio-ui.js under
  // Node would import Three.js, which the server deliberately does not need.
  const source = read('src/studio-ui.js');
  const start = source.indexOf('export const STUDIO_WATCHDOG=');
  const end = source.indexOf('const MARKUP=[', start);
  assert.ok(start >= 0 && end > start, 'Watchdog export must be present');
  const code = source.slice(start, end)
    .replace('export const STUDIO_WATCHDOG=', 'const STUDIO_WATCHDOG=')
    .replace('export function studioRecoveryReason(', 'function studioRecoveryReason(');
  return runInNewContext(code + '\n({settings:STUDIO_WATCHDOG,reason:studioRecoveryReason})');
}

test('Render: safe opt-in and production health configuration', () => {
  const yaml = read('render.yaml');
  assert.match(yaml, /branch:\s*main\b/);
  assert.match(yaml, /autoDeployTrigger:\s*checksPass\b/);
  assert.match(yaml, /healthCheckPath:\s*\/health\b/);
  assert.match(yaml, /- key: STUDIO_V5_ENABLED\s+value: ["']?false["']?/);
  assert.match(yaml, /- key: TIKTOK_LIVE_MODE\s+value: disabled\b/);
  assert.match(yaml, /- key: DATABASE_URL\s+sync: false\b/);
  assert.match(yaml, /- key: ADMIN_KEY\s+generateValue: true\b/);
  assert.match(yaml, /- key: TIKTOK_ID_SALT\s+generateValue: true\b/);
  assert.doesNotMatch(yaml, /postgres(?:ql)?:\/\//i, 'Never commit DB credentials');
});

test('Watchdog: timeout thresholds and bounded reload settings', () => {
  const {settings, reason} = watchdog();
  assert.equal(settings.intervalMs, 5000);
  assert.equal(settings.maxReloads, 3);
  assert.equal(settings.retryWindowMs, 15 * 60 * 1000);
  assert.equal(reason({now:10000,lastGoodFrameAt:5000,lastPacketAt:5000,
    startedAt:0,hasState:true}), null);
  assert.equal(reason({now:50000,lastGoodFrameAt:1000,lastPacketAt:49000,
    startedAt:0,hasState:true}), 'animation-stalled');
  assert.equal(reason({now:50000,lastGoodFrameAt:49000,lastPacketAt:1000,
    startedAt:0,hasState:true}), 'server-state-timeout');
  assert.equal(reason({now:66000,lastGoodFrameAt:0,lastPacketAt:0,
    startedAt:0,hasState:false}), 'initial-state-timeout');
  assert.equal(reason({now:50000,lastGoodFrameAt:49000,lastPacketAt:49000,
    startedAt:0,hasState:true,contextLostAt:1000}), 'webgl-context-lost');
});

test('Watchdog: no forced reload when hidden, offline or in preview', () => {
  const {reason} = watchdog();
  const stale = {now:90000,lastGoodFrameAt:0,lastPacketAt:0,
    startedAt:0,hasState:true};
  assert.equal(reason({...stale,visible:false}), null);
  assert.equal(reason({...stale,online:false}), null);
  assert.equal(reason({...stale,preview:true,lastGoodFrameAt:85000}), null);
});

test('Backend: V5 remains opt-in; health and SSE routes exist', () => {
  const server = read('server/index.js');
  const runtime = read('server/studio-runtime.js');
  assert.match(server, /STUDIO_V5_ENABLED/);
  assert.match(server, /path===\"\/health\"/);
  assert.match(runtime, /\/api\/studio\/health/);
  assert.match(runtime, /\/api\/studio\/events/);
  assert.match(runtime, /text\/event-stream/);
});
