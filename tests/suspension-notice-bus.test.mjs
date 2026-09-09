import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/api/suspension-feedback.ts', import.meta.url), 'utf8');
function setup(browser = true) {
  const exports = {}, tasks = [];
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, ...(browser ? { window: {} } : {}), setTimeout: fn => { tasks.push(fn); return tasks.length; } });
  return { ...exports, flush: () => tasks.splice(0).forEach(fn => fn()), tasks };
}
test('concurrent refusals produce one deferred notice, after generic caller feedback', () => {
  const bus = setup(), events = [];
  bus.subscribeSuspensionFeedback(n => events.push(n.message));
  bus.reportSuspensionFeedback({ mode: 'commercial', message: 'suspension' });
  bus.reportSuspensionFeedback({ mode: 'commercial', message: 'suspension' });
  events.push('generic caller error');
  assert.equal(bus.tasks.length, 1);
  bus.flush();
  assert.deepEqual(events, ['generic caller error', 'suspension']);
  bus.reportSuspensionFeedback({ mode: 'security', message: 'security' });
  bus.flush();
  assert.equal(events.at(-1), 'security');
});
test('unmounted listeners and server requests do not show notifications', () => {
  for (const browser of [true, false]) {
    const bus = setup(browser), seen = [];
    const unsubscribe = bus.subscribeSuspensionFeedback(n => seen.push(n));
    if (browser) unsubscribe();
    bus.reportSuspensionFeedback({ mode: 'security', message: 'blocked' });
    bus.flush();
    assert.deepEqual(seen, []);
  }
});
