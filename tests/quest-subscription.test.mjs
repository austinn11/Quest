import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { toSql } from 'spacetimedb';

let server;
let subscribeToQuestData;
before(async () => {
  server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'error' });
  ({ subscribeToQuestData } = await server.ssrLoadModule('/src/questboard/quest-subscription.ts'));
});
after(async () => { await server?.close(); });

function setup({ failSubscribe = false } = {}) {
  const cache = { slots: [], templates: [], completions: [], localQuests: [], area: [] };
  const listeners = {};
  const db = {};
  for (const [accessor, key] of [['myQuestSlots', 'slots'], ['questTemplates', 'templates'], ['myQuestCompletions', 'completions'], ['myLocalQuests', 'localQuests'], ['myQuestArea', 'area']]) {
    const sets = { insert: new Set(), update: new Set(), delete: new Set() };
    listeners[key] = sets;
    db[accessor] = {
      iter: () => cache[key].values(),
      onInsert: callback => sets.insert.add(callback), removeOnInsert: callback => sets.insert.delete(callback),
      onUpdate: callback => sets.update.add(callback), removeOnUpdate: callback => sets.update.delete(callback),
      onDelete: callback => sets.delete.add(callback), removeOnDelete: callback => sets.delete.delete(callback),
    };
  }
  const received = { applied: [], changes: [], errors: [] };
  const callbacks = {
    onApplied: (snapshot, id) => received.applied.push({ snapshot, id }),
    onChange: snapshot => received.changes.push(snapshot),
    onError: error => received.errors.push(error),
  };
  const handle = { isEnded: false, unsubscribeCount: 0, unsubscribe() { this.isEnded = true; this.unsubscribeCount++; } };
  let apply;
  let error;
  let querySql;
  let connectionId = 'first-connection';
  const connection = {
    db, connectionId: { toHexString: () => connectionId },
    subscriptionBuilder() {
      const builder = {
        onApplied(callback) { apply = callback; return builder; },
        onError(callback) { error = callback; return builder; },
        subscribe(queries) { if (failSubscribe) throw new Error('Cannot subscribe'); querySql = queries.map(query => toSql(query)); return handle; },
      };
      return builder;
    },
  };
  const cleanup = subscribeToQuestData(connection, callbacks);
  return {
    cache, received, listeners, cleanup, handle, querySql,
    apply: () => apply(),
    error: message => { handle.isEnded = true; error({ event: new Error(message) }); },
    reconnect: () => { connectionId = 'reconnected'; apply(); },
    emit(key, operation, id) { for (const callback of listeners[key][operation]) callback({ event: { id } }); },
  };
}

test('quest subscription reads only the public catalogue and caller-bound views, and waits for application', () => {
  const state = setup();
  assert.deepEqual(state.querySql, ['SELECT * FROM "my_quest_slots"', 'SELECT * FROM "quest_templates"', 'SELECT * FROM "my_quest_completions"', 'SELECT * FROM "my_local_quests"', 'SELECT * FROM "my_quest_area"']);
  state.cache.slots.push({ slotId: 'one' });
  state.emit('slots', 'insert', 'initial');
  assert.equal(state.received.changes.length, 0);
  state.apply();
  assert.equal(state.received.applied[0].id, 'first-connection');
  assert.deepEqual(state.received.applied[0].snapshot.slots, [{ slotId: 'one' }]);
  state.cleanup();
});

test('transaction callbacks deliver coherent slot/history changes once and handle subsequent deletion', () => {
  const state = setup();
  state.apply();
  state.cache.slots.push({ slotId: 'one', status: 'Cooldown' });
  state.cache.completions.push({ completionId: 1n, xpAwarded: 50 });
  state.emit('slots', 'update', 'completion-transaction');
  state.emit('completions', 'insert', 'completion-transaction');
  assert.equal(state.received.changes.length, 1);
  assert.deepEqual(state.received.changes[0].completions, [{ completionId: 1n, xpAwarded: 50 }]);
  assert.deepEqual(state.received.changes[0].slots, [{ slotId: 'one', status: 'Cooldown' }]);
  state.cache.completions.length = 0;
  state.emit('completions', 'delete', 'removed');
  assert.deepEqual(state.received.changes[1].completions, []);
  state.cleanup();
});

test('replayed subscription refreshes the snapshot and connection ID without registering extra listeners', () => {
  const state = setup();
  state.apply();
  state.cache.completions.push({ completionId: 2n });
  state.reconnect();
  assert.equal(state.received.applied[1].id, 'reconnected');
  assert.deepEqual(state.received.applied[1].snapshot.completions, [{ completionId: 2n }]);
  for (const listeners of Object.values(state.listeners)) for (const set of Object.values(listeners)) assert.equal(set.size, 1);
  state.cleanup();
});

test('subscription errors are surfaced and cleanup prevents callbacks after navigation or retry', () => {
  const state = setup();
  state.apply();
  state.error('View unavailable');
  assert.deepEqual(state.received.errors, ['View unavailable']);
  state.emit('slots', 'insert', 'after-error');
  assert.equal(state.received.changes.length, 0);
  state.cleanup();
  state.apply();
  assert.equal(state.received.applied.length, 1);
  for (const listeners of Object.values(state.listeners)) for (const set of Object.values(listeners)) assert.equal(set.size, 0);
  assert.equal(state.handle.unsubscribeCount, 0); // An error already ended this handle.
});

test('normal cleanup unsubscribes once and a synchronous subscription failure is retryable', () => {
  const state = setup();
  state.cleanup();
  state.cleanup();
  assert.equal(state.handle.unsubscribeCount, 1);
  const failed = setup({ failSubscribe: true });
  assert.deepEqual(failed.received.errors, ['Cannot subscribe']);
  failed.cleanup();
  for (const listeners of Object.values(failed.listeners)) for (const set of Object.values(listeners)) assert.equal(set.size, 0);
  const retry = setup();
  retry.apply();
  assert.equal(retry.received.applied.length, 1);
  retry.cleanup();
});

test('private local quests join the catalogue lookup and the quest area is exposed', () => {
  const state = setup();
  state.cache.templates.push({ templateId: 'easy-birdwatch' });
  state.cache.localQuests.push({ templateId: 'local-000000000001', title: 'Wildlife of Duck Pond' });
  state.cache.area.push({ latitude: 32.986, longitude: -96.75, placeCount: 12 });
  state.apply();
  const snapshot = state.received.applied[0].snapshot;
  assert.deepEqual(snapshot.templates.map(template => template.templateId), ['easy-birdwatch', 'local-000000000001']);
  assert.deepEqual(snapshot.area, { latitude: 32.986, longitude: -96.75, placeCount: 12 });
  state.cache.area.length = 0;
  state.emit('area', 'delete', 'area-cleared');
  assert.equal(state.received.changes.at(-1).area, null);
  state.cleanup();
});
