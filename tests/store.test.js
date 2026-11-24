import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../server/store.js';
import { validate, blank } from '../src/domain.js';

test('SQLite atomically rejects a stale revision', async () => {
  const store = await openStore({ sqlite: ':memory:' });
  try {
    assert.deepEqual(await store.read(), { revision: 0, register: blank() });
    assert.equal(await store.write(0, blank()), true);
    assert.equal(await store.write(0, blank()), false);
    assert.equal((await store.read()).revision, 1);
  } finally {
    await store.close();
  }
});

test('backup validation rejects invalid records and duplicate numeric IDs', () => {
  const item = { id: 'AR-0001', title: 'Review', team: 'Ops', owner: 'Kit', raised: '2026-11-24', due: '', closed: '', status: 'Open', issue: '', comment: '', responsible: '', accountable: '', consulted: '', informed: '' };
  assert.deepEqual(validate({version:1,next:2,actions:[item]}).actions[0], item);
  assert.throws(() => validate({version:1,next:2,actions:[item,{...item,id:'AR-1'}]}), /duplicate/);
  assert.throws(() => validate({version:1,next:2,actions:[{...item,due:'2026-02-31'}]}), /date/);
});
