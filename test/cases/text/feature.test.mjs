import test from 'node:test';
import assert from 'node:assert/strict';
import { textFeature } from '../../../dist/features/text/feature.js';
import { createStateStore } from '../../../dist/context/state.js';

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
  const ops = [];
  const gpu = {
    generation: 7,
    status: 'active',
    draw(op) {
      ops.push(op);
    },
    ...overrides.gpu,
  };
  const rasterCalls = { text: [], measure: [], normalize: [] };
  const raster = {
    text(text, x, y, drawState, mode) {
      const source = stubRasterSource(overrides.rasterBounds);
      rasterCalls.text.push({ text, x, y, state: drawState, mode, source });
      return source;
    },
    measureWidth(text, drawState) {
      rasterCalls.measure.push({ text, state: drawState });
      return overrides.width ?? 42.5;
    },
    normalizeFont(font) {
      rasterCalls.normalize.push(font);
      if (overrides.normalizeFont) return overrides.normalizeFont(font);
      return font === 'junk' ? null : `normalized:${font}`;
    },
  };
  const feature = textFeature({ state, gpu, raster, ...overrides.env });
  assert.equal(feature.id, 'text');
  return { state, gpu, ops, rasterCalls, members: feature.members };
}

test('the factory requires state, gpu and raster in the environment', () => {
  assert.throws(() => textFeature({}), { code: 'contract-violation' });
  const state = createStateStore({ fill: stubPaint(1), stroke: stubPaint(2) });
  assert.throws(() => textFeature({ state }), { code: 'contract-violation' });
});

test('missing arguments throw the native TypeError before any state is read', () => {
  const { members, rasterCalls } = setup();
  for (const name of ['fillText', 'strokeText']) {
    assert.throws(
      () => members[name].value('x', 1),
      (error) =>
        error instanceof TypeError &&
        error.message ===
          `Failed to execute '${name}' on 'CanvasRenderingContext2D': 3 arguments required, but only 2 present.`,
    );
    assert.throws(() => members[name].value(), TypeError);
  }
  assert.throws(
    () => members.measureText.value(),
    (error) =>
      error instanceof TypeError &&
      error.message ===
        "Failed to execute 'measureText' on 'CanvasRenderingContext2D': 1 argument required, but only 0 present.",
  );
  assert.equal(rasterCalls.text.length, 0);
  assert.equal(rasterCalls.measure.length, 0);
});

test('a present maxWidth argument reports unsupported-api on text draws while measureText ignores it', () => {
  const { members, rasterCalls } = setup();
  assert.throws(() => members.fillText.value('x', 0, 0, 100), { code: 'unsupported-api' });
  assert.throws(() => members.strokeText.value('x', 0, 0, 20), { code: 'unsupported-api' });
  // An explicit undefined is a missing optional argument: the 3-arg form runs.
  members.fillText.value('x', 0, 0, undefined);
  assert.equal(rasterCalls.text.length, 1);
  // measureText ignores extra arguments like any WebIDL method.
  members.measureText.value('x', 100);
  assert.equal(rasterCalls.measure.length, 1);
});

test('argument conversion follows WebIDL: Symbol/BigInt reject, strings and null coerce', () => {
  const { members, rasterCalls } = setup();
  assert.throws(() => members.fillText.value(Symbol('s'), 0, 0), TypeError);
  assert.throws(() => members.strokeText.value('x', 1n, 0), TypeError);
  assert.throws(() => members.measureText.value(Symbol('s')), TypeError);
  assert.equal(rasterCalls.text.length, 0);
  members.fillText.value(42, '1', null);
  assert.deepEqual(
    rasterCalls.text.map((call) => [call.text, call.x, call.y]),
    [['42', 1, 0]],
  );
});

test('non-finite coordinates are silently ignored', () => {
  const { members, rasterCalls, ops } = setup();
  for (const bad of [NaN, Infinity, -Infinity, undefined]) {
    members.fillText.value('x', bad, 0);
    members.strokeText.value('x', 0, bad);
  }
  assert.equal(rasterCalls.text.length, 0);
  assert.equal(ops.length, 0);
});

test('fillText/strokeText rasterize the snapshot once and release the source', () => {
  const { members, ops, rasterCalls } = setup();
  members.fillText.value('Hello', 10, 20);
  members.strokeText.value('World', 30, 40);
  assert.equal(rasterCalls.text.length, 2);
  const [fill, stroke] = rasterCalls.text;
  assert.equal(fill.text, 'Hello');
  assert.equal(fill.mode, 'fill');
  assert.equal(stroke.mode, 'stroke');
  assert.equal(ops.length, 2);
  const [op] = ops;
  assert.equal(op.generation, 7);
  assert.equal(op.kind, 'draw');
  assert.equal(op.clip, null);
  assert.deepEqual(op.sourceBounds, { x: 1, y: 2, width: 10, height: 12 });
  assert.equal(op.source.kind, 'raster');
  assert.equal(op.state, fill.state);
  assert.equal(fill.source.releases, 1);
  assert.equal(stroke.source.releases, 1);
});

test('offscreen text forwards an empty source for the composite operation', () => {
  const { members, ops, rasterCalls, state } = setup({
    rasterBounds: { x: 0, y: 0, width: 0, height: 0 },
  });
  state.set('composite', 'source-in');
  members.fillText.value('x', 5000, 5000);
  assert.equal(rasterCalls.text.length, 1);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].source.kind, 'empty');
  assert.equal(ops[0].state.composite, 'source-in');
  assert.equal(rasterCalls.text[0].source.releases, 1);
});

test('argument errors precede the disposed check; lost draws silently and still measures', () => {
  const disposed = setup({ gpu: { status: 'disposed' } });
  assert.throws(() => disposed.members.fillText.value('x'), TypeError);
  assert.throws(() => disposed.members.fillText.value('x', 0, 0), { code: 'disposed' });
  assert.throws(() => disposed.members.measureText.value('x'), { code: 'disposed' });
  const lost = setup({ gpu: { status: 'lost' } });
  lost.members.fillText.value('x', 0, 0);
  lost.members.strokeText.value('x', 0, 0);
  assert.equal(lost.ops.length, 0);
  assert.equal(lost.rasterCalls.text.length, 0);
  const metrics = lost.members.measureText.value('x');
  assert.equal(metrics.width, 42.5);
});

test('measureText returns a fresh width-only metrics object per call', () => {
  const { members, rasterCalls } = setup({ width: 123.25 });
  const first = members.measureText.value('Ag');
  const second = members.measureText.value('Ag');
  assert.notEqual(first, second);
  assert.equal(first.width, 123.25);
  assert.equal(rasterCalls.measure.length, 2);
  assert.equal('width' in first, true);
  assert.deepEqual(Object.keys(first), []);
  assert.equal(JSON.stringify(first), '{}');
  // Strict-mode assignment to a setter-less accessor is a native TypeError.
  assert.throws(() => {
    first.width = 5;
  }, TypeError);
  for (const name of [
    'actualBoundingBoxLeft',
    'actualBoundingBoxRight',
    'actualBoundingBoxAscent',
    'actualBoundingBoxDescent',
    'fontBoundingBoxAscent',
    'fontBoundingBoxDescent',
    'emHeightAscent',
    'emHeightDescent',
    'hangingBaseline',
    'alphabeticBaseline',
    'ideographicBaseline',
  ]) {
    assert.throws(() => first[name], { code: 'unsupported-api' }, name);
  }
});

test('measureText measures against a snapshot of the current text state', () => {
  const { members, state, rasterCalls } = setup();
  state.set('font', '24px sans-serif');
  state.set('textAlign', 'center');
  state.set('textBaseline', 'middle');
  members.measureText.value('snap');
  const [call] = rasterCalls.measure;
  assert.equal(call.state.font, '24px sans-serif');
  assert.equal(call.state.textAlign, 'center');
  assert.equal(call.state.textBaseline, 'middle');
});

test('font setter normalizes through the raster service and ignores invalid strings', () => {
  const { members, state, rasterCalls } = setup();
  assert.equal(members.font.get(), '10px sans-serif');
  members.font.set('24px serif');
  assert.equal(state.get('font'), 'normalized:24px serif');
  members.font.set('junk');
  assert.equal(state.get('font'), 'normalized:24px serif');
  members.font.set(undefined);
  members.font.set(null);
  members.font.set(42);
  assert.deepEqual(rasterCalls.normalize, ['24px serif', 'junk', 'undefined', 'null', '42']);
  assert.throws(() => members.font.set(Symbol('s')), TypeError);
});

test('textAlign setter accepts the matrix values, reports start/end, ignores junk', () => {
  const { members, state } = setup();
  assert.equal(members.textAlign.get(), 'start');
  for (const value of ['left', 'center', 'right']) {
    members.textAlign.set(value);
    assert.equal(state.get('textAlign'), value);
  }
  for (const value of ['start', 'end'])
    assert.throws(() => members.textAlign.set(value), { code: 'unsupported-api' });
  assert.equal(state.get('textAlign'), 'right');
  for (const junk of ['JUNK', 42, null, {}, ['x']]) members.textAlign.set(junk);
  assert.equal(state.get('textAlign'), 'right');
});

test('textBaseline setter accepts the matrix values, reports the rest, ignores junk', () => {
  const { members, state } = setup();
  assert.equal(members.textBaseline.get(), 'alphabetic');
  for (const value of ['top', 'middle', 'bottom']) {
    members.textBaseline.set(value);
    assert.equal(state.get('textBaseline'), value);
  }
  for (const value of ['alphabetic', 'hanging', 'ideographic'])
    assert.throws(() => members.textBaseline.set(value), { code: 'unsupported-api' });
  assert.equal(state.get('textBaseline'), 'bottom');
  for (const junk of ['JUNK', 42, null, {}, ['x']]) members.textBaseline.set(junk);
  assert.equal(state.get('textBaseline'), 'bottom');
});

test('text state participates in the save/restore stack', () => {
  const { members, state } = setup();
  members.font.set('24px serif');
  members.textAlign.set('center');
  members.textBaseline.set('top');
  state.save();
  members.font.set('12px monospace');
  members.textAlign.set('left');
  members.textBaseline.set('bottom');
  state.restore();
  assert.equal(members.font.get(), 'normalized:24px serif');
  assert.equal(members.textAlign.get(), 'center');
  assert.equal(members.textBaseline.get(), 'top');
});
