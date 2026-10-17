import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SUPPORT_MATRIX } from '../../dist/contracts/support.js';
import { apiCases, interactionCases } from '../../.build/test/cases/manifest/index.js';

test('DOM declaration inventory and runtime unsupported catalog cannot drift apart', async () => {
  const source = await readFile(new URL('../types/dom-catalog.ts', import.meta.url), 'utf8');
  const inventory = [...source.split(';')[0].matchAll(/"([^"]+)"/g)].map(m => m[1]).sort();
  assert.deepEqual(SUPPORT_MATRIX.filter(r => r.target === 'context').map(r => r.name).sort(), inventory);
});

test('API and interaction acceptance IDs do not collide or contain executable placeholders', () => {
  const all = [...apiCases, ...interactionCases];
  assert.equal(new Set(all.map(c => c.id)).size, all.length);
  assert.ok(interactionCases.some(c => c.id === 'IMG-02.same-task-mutations'));
  assert.ok(interactionCases.some(c => c.id === 'ACC-03.source-in-outside-source'));
  for (const entry of all) assert.equal('run' in entry, false);
});

test('both catalogs expose immutable requirement arrays to a shared consumer', () => {
  const all = [...apiCases, ...interactionCases];
  for (const entry of all) {
    assert.ok(Array.isArray(entry.requirements), `${entry.id}: requirements must be an array`);
    assert.ok(entry.requirements.length > 0, `${entry.id}: missing requirements`);
    assert.ok(entry.requirements.every(id => typeof id === 'string' && id.length > 0));
    assert.equal('requirement' in entry, false);
    assert.throws(() => entry.requirements.push('unexpected'), TypeError);
  }
  const covering = requirement => all.filter(entry => entry.requirements.includes(requirement)).map(entry => entry.id);
  assert.ok(covering('context.drawImage').includes('context.drawImage.arity-3'));
  assert.ok(covering('IMG-02').includes('IMG-02.same-task-mutations'));
});
