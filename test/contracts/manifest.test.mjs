import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORT_MATRIX, lookupMember, REQUIRED_CASES } from '../../dist/contracts/support.js';

test('approved overloads and exclusions remain distinct from unknown spellings', () => {
  assert.deepEqual(lookupMember('context', 'drawImage').arities, [3, 5, 9]);
  assert.deepEqual(lookupMember('context', 'fillText').arities, [3]);
  assert.deepEqual(lookupMember('context', 'clip').values, ['evenodd']);
  assert.equal(lookupMember('context', 'getImageData').policy, 'unsupported');
  assert.equal(lookupMember('context', 'fillRekt'), undefined);
  assert.equal(lookupMember('canvas', 'toDataURL').policy, 'unsupported');
  assert.deepEqual(lookupMember('context', 'createPattern').sources, ['CORS-clean-HTMLImageElement']);
});

test('every declared contract has unique stable cases, none claiming implementation', () => {
  assert.equal(new Set(SUPPORT_MATRIX.map(r => r.id)).size, SUPPORT_MATRIX.length);
  assert.equal(new Set(REQUIRED_CASES.map(r => r.id)).size, REQUIRED_CASES.length);
  for (const row of SUPPORT_MATRIX) {
    assert.equal(row.implementation, undefined);
    assert.ok(REQUIRED_CASES.some(c => c.requirements.includes(row.id)));
  }
  assert.throws(() => { lookupMember('context', 'drawImage').arities.push(7); }, TypeError);
});
