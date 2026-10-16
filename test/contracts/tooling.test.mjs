import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discover } from '../../scripts/discover.mjs';

const cwd = new URL('../../', import.meta.url);
test('unavailable browser/report/acceptance commands never report success', () => {
  for (const stage of ['browser', 'report', 'acceptance']) {
    const result = spawnSync(process.execPath, ['scripts/testing.mjs', stage], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.execution, 'blocked');
    assert.equal(report.stage, stage);
    assert.equal(report.reason, 'driver-not-implemented');
  }
});

test('unit discovery is deterministic and an empty suite fails instead of passing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas-contract-tests-'));
  try {
    const empty = spawnSync(process.execPath, ['scripts/unit.mjs', root], { cwd, encoding: 'utf8' });
    assert.equal(empty.status, 2);
    assert.match(empty.stderr, /No unit tests/);
    await mkdir(join(root, 'nested'));
    await writeFile(join(root, 'nested', 'b.test.mjs'), '');
    await writeFile(join(root, 'a.test.mjs'), '');
    await writeFile(join(root, 'ignore.case.js'), '');
    assert.deepEqual((await discover(root, '.test.mjs')).map(f => f.slice(root.length + 1)), ['a.test.mjs', 'nested/b.test.mjs']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
