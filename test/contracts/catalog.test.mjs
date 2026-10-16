import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SUPPORT_MATRIX } from '../../src/contracts/support.js';
import { apiCases, interactionCases } from '../cases/manifest/index.js';

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
