import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('built package exports only the public fail-fast factory, never test hooks', async () => {
  const api = await import('canvas2d-webgl');
  assert.deepEqual(Object.keys(api), ['createCompatCanvas']);
  assert.throws(() => api.createCompatCanvas({}), { code: 'not-implemented' });
  for (const path of ['canvas2d-webgl/testing', 'canvas2d-webgl/contracts', 'canvas2d-webgl/types/internal/testing']) {
    await assert.rejects(import(path), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  }
  const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(pkg.files, ['dist', 'README.md']);
});
