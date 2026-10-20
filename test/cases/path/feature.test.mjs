import test from 'node:test';
import assert from 'node:assert/strict';
import { pathFeature } from '../../../dist/features/path/feature.js';
import { createStateStore } from '../../../dist/context/state.js';
import { PathRecorder } from '../../../dist/path/recorder.js';

function stubPaint(id, paint = { kind: 'solid', color: [0, 0, 0, 1] }) {
  return {
    id,
    version: 0,
    snapshot() {
      return Object.freeze({ ...paint, ...(paint.color ? { color: Object.freeze([...paint.color]) } : {}) });
    },
  };
}

function stubRasterSource(bounds = { x: 1, y: 2, width: 10, height: 12 }) {
  return {
    kind: 'raster',
    canvas: { width: bounds.width || 1, height: bounds.height || 1 },
    bounds,
    pixelWidth: bounds.width || 1,
    pixelHeight: bounds.height || 1,
    colorSpace: 'srgb',
    alpha: 'straight',
    releases: 0,
    release() {
      this.releases += 1;
    },
  };
}

function setup(overrides = {}) {
  const state = createStateStore({ fill: stubPaint(1), stroke: stubPaint(2) });
  const path = new PathRecorder();
  const ops = [];
  const gpu = {
    generation: 7,
    status: 'active',
    draw(op) {
      ops.push(op);
    },
    ...overrides.gpu,
  };
  const rasterCalls = [];
  const raster = {
    path(snapshot, drawState, mode) {
      const source = stubRasterSource(overrides.rasterBounds);
      rasterCalls.push({ snapshot, state: drawState, mode, source });
      return source;
    },
  };
  const feature = pathFeature({ state, path, gpu, raster });
  assert.equal(feature.id, 'path');
  return { state, path, gpu, ops, rasterCalls, members: feature.members };
}

test('the factory requires state, gpu, raster and a PathRecorder path', () => {
  assert.throws(() => pathFeature({}), { code: 'contract-violation' });
  const state = createStateStore({ fill: stubPaint(1), stroke: stubPaint(2) });
  const gpu = { generation: 1, status: 'active', draw() {} };
  const raster = { path: () => stubRasterSource() };
  assert.throws(() => pathFeature({ state, gpu, raster }), { code: 'contract-violation' });
  // A duck-typed PathStore is not enough: the native argument semantics and
  // the shared reset ownership live on the concrete recorder.
  const fakeStore = { begin() {}, append() {}, snapshot() {}, reset() {} };
  assert.throws(() => pathFeature({ state, path: fakeStore, gpu, raster }), {
    code: 'contract-violation',
  });
});

test('missing arguments throw the native TypeError before anything is recorded', () => {
  const { path, members } = setup();
  const required = { moveTo: 2, lineTo: 2, rect: 4, quadraticCurveTo: 4, arcTo: 5, arc: 5, ellipse: 7 };
  for (const [name, count] of Object.entries(required)) {
    assert.throws(
      () => members[name].value(...Array(count - 1).fill(0)),
      (error) =>
        error instanceof TypeError &&
        error.message ===
          `Failed to execute '${name}' on 'CanvasRenderingContext2D': ${count} arguments required, but only ${count - 1} present.`,
    );
    assert.throws(() => members[name].value(), TypeError);
  }
  assert.equal(path.snapshot().commands.length, 0);
});

test('BigInt and Symbol arguments reject with a native TypeError', () => {
  const { path, members } = setup();
  assert.throws(() => members.moveTo.value(1n, 0), TypeError);
  assert.throws(() => members.lineTo.value(0, Symbol('x')), TypeError);
  assert.throws(() => members.arc.value(0n, 0, 1, 0, 1), TypeError);
  assert.equal(path.snapshot().commands.length, 0);
});

test('non-finite coordinates are silently dropped, exactly like native', () => {
  const { path, members } = setup();
  for (const bad of [NaN, Infinity, -Infinity, undefined]) {
    members.moveTo.value(bad, 0);
    members.lineTo.value(0, bad);
    members.rect.value(0, 0, bad, 4);
    members.quadraticCurveTo.value(0, bad, 1, 1);
    members.arcTo.value(0, 0, 1, 1, bad);
    members.arc.value(0, 0, bad, 0, 1);
    members.ellipse.value(0, 0, 1, bad, 0, 0, 1);
  }
  assert.equal(path.snapshot().commands.length, 0);
  members.moveTo.value(1, 1);
  members.lineTo.value(NaN, 2);
  assert.equal(path.snapshot().commands.length, 1);
});

test('negative radii throw the native IndexSizeError before recording', () => {
  const { path, members } = setup();
  assert.throws(
    () => members.arc.value(0, 0, -5, 0, 1),
    (error) =>
      error instanceof DOMException &&
      error.name === 'IndexSizeError' &&
      error.message ===
        "Failed to execute 'arc' on 'CanvasRenderingContext2D': The radius provided (-5) is negative.",
  );
  assert.throws(() => members.arcTo.value(0, 0, 1, 1, -2), { name: 'IndexSizeError' });
  assert.throws(
    () => members.ellipse.value(0, 0, -1, 1, 0, 0, 1),
    (error) => error instanceof DOMException && error.message.includes('major-axis'),
  );
  assert.throws(
    () => members.ellipse.value(0, 0, 1, -1, 0, 0, 1),
    (error) => error instanceof DOMException && error.message.includes('minor-axis'),
  );
  assert.equal(path.snapshot().commands.length, 0);
});

test('construction records the transform in effect at each call', () => {
  const { state, path, members } = setup();
  state.set('transform', [1, 0, 0, 1, 10, 20]);
  members.moveTo.value(1, 2);
  state.set('transform', [2, 0, 0, 2, 0, 0]);
  members.lineTo.value(3, 4);
  members.closePath.value();
  const [move, line, close] = path.snapshot().commands;
  assert.deepEqual([...move.transform], [1, 0, 0, 1, 10, 20]);
  assert.deepEqual([...line.transform], [2, 0, 0, 2, 0, 0]);
  assert.deepEqual([...close.transform], [2, 0, 0, 2, 0, 0]);
});

test('arc and ellipse coerce anticlockwise as a WebIDL boolean', () => {
  const { path, members } = setup();
  members.arc.value(0, 0, 1, 0, 1);
  members.arc.value(0, 0, 1, 0, 1, 'yes');
  members.ellipse.value(0, 0, 1, 1, 0, 0, 1, 0);
  members.ellipse.value(0, 0, 1, 1, 0, 0, 1, 1n);
  const commands = path.snapshot().commands;
  assert.deepEqual(commands.map((command) => command.args.at(-1)), [false, true, false, true]);
});

test('fill composites the rasterized current path as one draw operation', () => {
  const { state, members, ops, rasterCalls } = setup();
  state.set('transform', [1, 0, 0, 1, 5, 6]);
  members.moveTo.value(0, 0);
  members.lineTo.value(8, 0);
  members.lineTo.value(4, 8);
  state.set('transform', [1, 0, 0, 1, 50, 60]); // draw-time transform differs
  members.fill.value();
  assert.equal(rasterCalls.length, 1);
  const [{ snapshot, state: drawState, mode, source }] = rasterCalls;
  assert.equal(mode, 'fill');
  assert.equal(snapshot.commands.length, 3);
  assert.deepEqual([...snapshot.commands[0].transform], [1, 0, 0, 1, 5, 6]);
  assert.deepEqual([...drawState.transform], [1, 0, 0, 1, 50, 60]);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].generation, 7);
  assert.equal(ops[0].kind, 'draw');
  assert.equal(ops[0].source, source);
  assert.deepEqual(ops[0].sourceBounds, source.bounds);
  assert.equal(source.releases, 1);
});

test('stroke passes the stroke state through the snapshot', () => {
  const { state, members, ops, rasterCalls } = setup();
  state.set('lineWidth', 4);
  state.set('lineCap', 'round');
  state.set('lineJoin', 'round');
  members.moveTo.value(0, 0);
  members.lineTo.value(8, 8);
  members.stroke.value();
  const [{ state: drawState, mode, source }] = rasterCalls;
  assert.equal(mode, 'stroke');
  assert.equal(drawState.lineWidth, 4);
  assert.equal(drawState.lineCap, 'round');
  assert.equal(drawState.lineJoin, 'round');
  assert.equal(ops[0].source, source);
  assert.equal(source.releases, 1);
});

test('an empty raster asset preserves the composite operation and releases its lease', () => {
  const { state, members, ops, rasterCalls } = setup({
    rasterBounds: { x: 0, y: 0, width: 0, height: 0 },
  });
  state.set('composite', 'source-in');
  members.rect.value(1000, 1000, 4, 4);
  members.fill.value();
  assert.equal(rasterCalls.length, 1);
  assert.equal(ops.length, 1);
  assert.deepEqual(ops[0].source, { kind: 'empty' });
  assert.equal(ops[0].state.composite, 'source-in');
  assert.equal(rasterCalls[0].source.releases, 1);
});

test('the effective clip passes through to the operation unchanged', () => {
  const { state, members, ops } = setup();
  const clip = Object.freeze({
    id: 3,
    parent: null,
    path: Object.freeze({ id: 4, commands: Object.freeze([]) }),
    rule: 'evenodd',
  });
  state.set('clip', clip);
  members.rect.value(0, 0, 4, 4);
  members.fill.value();
  assert.equal(ops[0].clip, clip);
});

test('beginPath starts a new current path; earlier snapshots stay immutable', () => {
  const { members, rasterCalls } = setup();
  members.moveTo.value(1, 1);
  members.lineTo.value(2, 2);
  members.fill.value();
  const first = rasterCalls[0].snapshot;
  assert.equal(first.commands.length, 2);
  members.beginPath.value();
  members.rect.value(0, 0, 4, 4);
  members.fill.value();
  const second = rasterCalls[1].snapshot;
  assert.notEqual(second.id, first.id);
  assert.equal(second.commands.length, 1);
  assert.equal(second.commands[0].op, 'rect');
  // Recording more commands must not mutate the snapshot the first draw took.
  assert.equal(first.commands.length, 2);
});

test('a path with no constructed geometry does not composite', () => {
  const { members, ops, rasterCalls } = setup();
  members.fill.value();
  members.closePath.value();
  members.stroke.value();
  assert.equal(ops.length, 0);
  assert.equal(rasterCalls.length, 0);
});

test('fill and stroke with any argument report unsupported-api', () => {
  const { members, ops, rasterCalls } = setup();
  const fakePath = {};
  const attempts = [
    ['fill(Path2D)', () => members.fill.value(fakePath), 'fill'],
    ['fill("evenodd")', () => members.fill.value('evenodd'), 'fill'],
    ['fill(Path2D, rule)', () => members.fill.value(fakePath, 'evenodd'), 'fill'],
    ['stroke(Path2D)', () => members.stroke.value(fakePath), 'stroke'],
  ];
  for (const [, invoke, name] of attempts) {
    assert.throws(
      invoke,
      (error) => error.code === 'unsupported-api' && error.message.includes(name),
    );
  }
  assert.equal(ops.length, 0);
  assert.equal(rasterCalls.length, 0);
});

test('a disposed device rejects; a lost device is silently ineffective', () => {
  const disposed = setup({ gpu: { status: 'disposed' } });
  assert.throws(() => disposed.members.beginPath.value(), { code: 'disposed' });
  assert.throws(() => disposed.members.moveTo.value(1, 1), { code: 'disposed' });
  assert.throws(() => disposed.members.fill.value(), { code: 'disposed' });
  assert.throws(() => disposed.members.stroke.value(), { code: 'disposed' });
  assert.equal(disposed.ops.length, 0);
  const lost = setup({ gpu: { status: 'lost' } });
  lost.members.beginPath.value();
  lost.members.moveTo.value(1, 1);
  lost.members.lineTo.value(2, 2);
  lost.members.fill.value();
  lost.members.stroke.value();
  // Recording is part of drawing: while lost nothing is queued or retained.
  assert.equal(lost.path.snapshot().commands.length, 0);
  assert.equal(lost.ops.length, 0);
  assert.equal(lost.rasterCalls.length, 0);
});

test('argument errors win over the disposed check, like the rect entries', () => {
  const { members } = setup({ gpu: { status: 'disposed' } });
  assert.throws(() => members.moveTo.value(1), TypeError);
  assert.throws(() => members.fill.value({}), { code: 'unsupported-api' });
});
