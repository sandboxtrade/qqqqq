import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const js = ts.transpileModule(source('src/storage/turn-outbox.ts'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const outbox = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

function installStorage() {
  const values = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  return () => { globalThis.localStorage = previous; };
}

test('unsent turn journal survives failed requests, preserves the original ID and isolates users', () => {
  const restore = installStorage();
  try {
    const original = { id: 'original-turn-id', role: 'user', text: 'Как дела?', timestamp: Date.now() };
    outbox.rememberUnsentTurn('uid-1', 'alexandra_v1', original);
    outbox.rememberUnsentTurn('uid-1', 'alexandra_v1', original);
    assert.deepEqual(outbox.readUnsentTurns('uid-1', 'alexandra_v1'), [original]);
    assert.deepEqual(outbox.readUnsentTurns('uid-2', 'alexandra_v1'), []);
    assert.deepEqual(outbox.readUnsentTurns('uid-1', 'future_character'), []);
    outbox.forgetUnsentTurn('uid-1', 'alexandra_v1', original.id);
    assert.deepEqual(outbox.readUnsentTurns('uid-1', 'alexandra_v1'), []);
  } finally { restore(); }
});

test('outbox retains economy context, prunes expired turns and clears after conversation reset', () => {
  const restore = installStorage();
  try {
    const record = { id: 'economy-event', role: 'user', text: 'encoded-economy-event',
      contextText: 'Подарила книгу', timestamp: Date.now() };
    outbox.rememberUnsentTurn('uid-1', 'alexandra_v1', record);
    outbox.rememberUnsentTurn('uid-1', 'alexandra_v1', {
      ...record, id: 'expired', timestamp: Date.now() - 15 * 86400000,
    });
    assert.deepEqual(outbox.readUnsentTurns('uid-1', 'alexandra_v1'), [record]);
    outbox.clearUnsentTurns('uid-1', 'alexandra_v1');
    assert.deepEqual(outbox.readUnsentTurns('uid-1', 'alexandra_v1'), []);
  } finally { restore(); }
});

test('committed reply is independent of later optional Firebase intimacy writes', () => {
  const runtime = source('src/engine/runtime.ts');
  const commitIndex = runtime.indexOf('    await repository.commitTurn(');
  const sideEffectIndex = runtime.indexOf('  let savedIntimacy = reactedIntimacyState;', commitIndex);
  const nextPhaseIndex = runtime.indexOf('  const trace: RuntimeTrace', sideEffectIndex);
  assert.ok(commitIndex > 0 && sideEffectIndex > commitIndex && nextPhaseIndex > sideEffectIndex);
  const section = runtime.slice(sideEffectIndex, nextPhaseIndex);
  assert.match(section, /secondary intimacy save failed after committed reply/);
  assert.match(section, /secondary intimacy preferences save failed after committed reply/);
  assert.doesNotMatch(section, /throw error;/);
  assert.match(runtime, /pending marker cleanup deferred for saved reply/);
  assert.match(runtime, /saved reply available; full refresh deferred/);
});

test('retrying a failed turn preserves the ID and avoids immediate live-sync contention', () => {
  const store = source('src/app/store.ts');
  assert.match(store, /rememberUnsentTurn\(store\.user\?\.uid/);
  assert.match(store, /forgetUnsentTurn\(store\.user\?\.uid/);
  assert.match(store, /readUnsentTurns\(user\?\.uid/);
  assert.match(store, /if \(!failed\) flushLiveRevision\?\.\(\);/);
  assert.match(store, /if \(message\) await sendTurn\(message\);/);
});
