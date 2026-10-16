import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompatCanvas } from '../../src/index.js';
import { createCompatError, ERROR_CODES, rollbackInitialization } from '../../src/contracts/errors.js';

test('unimplemented factory fails explicitly without touching the target', () => {
  const target = new Proxy({}, { get() { throw Error('Target was touched'); } });
  assert.throws(() => createCompatCanvas(target), { code: 'not-implemented' });
});

test('stable errors identify the capability without converting native exceptions', () => {
  const error = createCompatError(ERROR_CODES.UNSUPPORTED_API, 'getImageData');
  assert.equal(error.code, 'unsupported-api');
  assert.match(error.message, /getImageData/);
  assert.ok(error instanceof Error);
});

test('initialization rollback releases in reverse order and preserves original failure', () => {
  const order = [], original = new Error('allocation failed');
  const cleanups = [() => order.push('first'), () => { order.push('second'); throw Error('cleanup'); }, () => order.push('third')];
  assert.throws(() => rollbackInitialization(original, cleanups), e => e === original);
  assert.deepEqual(order, ['third', 'second', 'first']);
  assert.equal(cleanups.length, 0);
});
