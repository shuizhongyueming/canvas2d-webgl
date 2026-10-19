import test from 'node:test';
import assert from 'node:assert/strict';
import { createStateStore } from '../../../dist/context/state.js';
import { stateFeature } from '../../../dist/context/feature.js';

function stubPaint(id) {
  return {
    id,
    version: 0,
    snapshot() {
      return Object.freeze({ kind: 'solid', color: Object.freeze([0, 0, 0, 1]) });
    },
  };
}

function setup() {
  const state = createStateStore({ fill: stubPaint(0), stroke: stubPaint(1) });
  const feature = stateFeature({ state });
  assert.equal(feature.id, 'state');
  return { state, members: feature.members };
}

function matrixOf(state) {
  return [...state.get('transform')];
}

test('property getters report the native defaults', () => {
  const { members } = setup();
  assert.equal(members.globalAlpha.get(), 1);
  assert.equal(members.lineWidth.get(), 1);
  assert.equal(members.lineCap.get(), 'butt');
  assert.equal(members.lineJoin.get(), 'miter');
});

test('globalAlpha accepts [0,1] and coerces, ignores the rest', () => {
  const { members } = setup();
  const seen = [];
  const set = (v) => { members.globalAlpha.set(v); seen.push(members.globalAlpha.get()); };
  set(0.5); set(2); set(-1); set(NaN); set(Infinity); set('0.25'); set(0); set(1);
  assert.deepEqual(seen, [0.5, 0.5, 0.5, 0.5, 0.5, 0.25, 0, 1]);
});

test('lineWidth accepts positive finite numbers, ignores the rest', () => {
  const { members } = setup();
  const seen = [];
  const set = (v) => { members.lineWidth.set(v); seen.push(members.lineWidth.get()); };
  set(3); set(0); set(-5); set(NaN); set(Infinity); set('2');
  assert.deepEqual(seen, [3, 3, 3, 3, 3, 2]);
});

test('lineCap supports butt/round, reports square, ignores illegal values', () => {
  const { members } = setup();
  members.lineCap.set('round');
  assert.equal(members.lineCap.get(), 'round');
  members.lineCap.set('butt');
  assert.equal(members.lineCap.get(), 'butt');
  assert.throws(() => members.lineCap.set('square'), { code: 'unsupported-api' });
  assert.equal(members.lineCap.get(), 'butt');
  for (const junk of ['foo', 42, null, {}]) members.lineCap.set(junk);
  assert.equal(members.lineCap.get(), 'butt');
  assert.throws(() => members.lineCap.set(Symbol('x')), TypeError);
});

test('lineJoin supports round, reports miter/bevel, ignores illegal values', () => {
  const { members } = setup();
  members.lineJoin.set('round');
  assert.equal(members.lineJoin.get(), 'round');
  assert.throws(() => members.lineJoin.set('miter'), { code: 'unsupported-api' });
  assert.throws(() => members.lineJoin.set('bevel'), { code: 'unsupported-api' });
  assert.equal(members.lineJoin.get(), 'round');
  for (const junk of ['foo', 42, null, {}]) members.lineJoin.set(junk);
  assert.equal(members.lineJoin.get(), 'round');
  assert.throws(() => members.lineJoin.set(Symbol('x')), TypeError);
});

test('transform composition matches native matrix arithmetic bit for bit', () => {
  const { state, members } = setup();
  assert.deepEqual(matrixOf(state), [1, 0, 0, 1, 0, 0]);
  members.translate.value(10, 20);
  assert.deepEqual(matrixOf(state), [1, 0, 0, 1, 10, 20]);
  members.scale.value(2, 3);
  assert.deepEqual(matrixOf(state), [2, 0, 0, 3, 10, 20]);
  members.rotate.value(Math.PI / 2);
  assert.deepEqual(matrixOf(state), [1.2246467991473532e-16, 3, -2, 1.8369701987210297e-16, 10, 20]);
  members.translate.value(-5, 5);
  assert.deepEqual(matrixOf(state), [1.2246467991473532e-16, 3, -2, 1.8369701987210297e-16, 0, 5.000000000000002]);
  members.setTransform.value(2, 0, 0, 2, 5, 5);
  assert.deepEqual(matrixOf(state), [2, 0, 0, 2, 5, 5]);
});

test('translate is a no-op on a singular CTM while scale/rotate/setTransform still apply', () => {
  const { state, members } = setup();
  members.setTransform.value(1, 0, 0, 0, 0, 0);
  members.translate.value(5, 5);
  assert.deepEqual(matrixOf(state), [1, 0, 0, 0, 0, 0]);
  members.scale.value(2, 2);
  assert.deepEqual(matrixOf(state), [2, 0, 0, 0, 0, 0]);
  members.setTransform.value(1, 0, 0, 0, 0, 0);
  members.rotate.value(1);
  assert.deepEqual(matrixOf(state), [0.5403023058681398, 0, -0.8414709848078965, 0, 0, 0]);
  members.setTransform.value(1, 0, 0, 1, 0, 0);
  members.scale.value(0, 0);
  members.translate.value(5, 5);
  assert.deepEqual(matrixOf(state), [0, 0, 0, 0, 0, 0]);
  members.setTransform.value(2, 0, 0, 2, 3, 3);
  assert.deepEqual(matrixOf(state), [2, 0, 0, 2, 3, 3]);
});

test('translate/scale/setTransform quantize arguments to float32 like Chromium', () => {
  const { state, members } = setup();
  members.translate.value(Math.PI, 0);
  assert.deepEqual(matrixOf(state), [1, 0, 0, 1, Math.fround(Math.PI), 0]);
  members.setTransform.value(1, 0, 0, 1, 0, 0);
  members.scale.value(Math.PI, 1);
  assert.deepEqual(matrixOf(state), [Math.fround(Math.PI), 0, 0, 1, 0, 0]);
  members.setTransform.value(Math.PI, 0, 0, 1, 0, 0);
  assert.deepEqual(matrixOf(state), [Math.fround(Math.PI), 0, 0, 1, 0, 0]);
  members.setTransform.value(1, 0, 0, 1, 0, 0);
  members.scale.value(0.1, 1);
  members.scale.value(0.2, 1);
  assert.deepEqual(matrixOf(state), [Math.fround(0.1) * Math.fround(0.2), 0, 0, 1, 0, 0]);
  members.setTransform.value(1, 0, 0, 1, 0, 0);
  members.translate.value(0.1, 0);
  members.translate.value(0.2, 0);
  assert.deepEqual(matrixOf(state), [1, 0, 0, 1, Math.fround(0.1) + Math.fround(0.2), 0]);
  members.setTransform.value(1, 0, 0, 1, 0, 0);
  members.translate.value(1e300, 0);
  assert.deepEqual(matrixOf(state), [1, 0, 0, 1, 3.4028234663852886e38, 0]);
  members.setTransform.value(1, 0, 0, 1, 0, 0);
  members.rotate.value(Math.PI);
  assert.deepEqual(matrixOf(state), [-1, Math.sin(Math.PI), -Math.sin(Math.PI), -1, 0, 0]);
});

test('BigInt arguments are native TypeErrors at every numeric entry', () => {
  const { members } = setup();
  assert.throws(() => members.translate.value(1n, 0), TypeError);
  assert.throws(() => members.rotate.value(1n), TypeError);
  assert.throws(() => members.scale.value(1n, 1), TypeError);
  assert.throws(() => members.setTransform.value(1n, 0, 0, 1, 0, 0), TypeError);
  assert.throws(() => members.globalAlpha.set(1n), TypeError);
  assert.throws(() => members.lineWidth.set(1n), TypeError);
  members.lineCap.set(1n);
  assert.equal(members.lineCap.get(), 'butt');
  members.lineJoin.set(1n);
  assert.equal(members.lineJoin.get(), 'miter');
});

test('setTransform preserves a/b/c/d -0 but normalizes e/f to +0 like Chromium', () => {
  const { state, members } = setup();
  members.setTransform.value(-2, -0, -0, -1, -0, -0);
  const m = matrixOf(state);
  assert.deepEqual(m, [-2, -0, -0, -1, 0, 0]);
  assert.ok(Object.is(m[1], -0) && Object.is(m[2], -0));
  assert.ok(!Object.is(m[4], -0) && !Object.is(m[5], -0));
  members.setTransform.value(-0, 0, 0, -0, 0, 0);
  const ad = matrixOf(state);
  assert.ok(Object.is(ad[0], -0) && Object.is(ad[3], -0));
  members.setTransform.value(1, 0, 0, 1, 0, 0);
  members.translate.value(-0, -0);
  const t2 = matrixOf(state);
  assert.ok(!Object.is(t2[4], -0) && !Object.is(t2[5], -0));
});

test('negative scale mirrors, including native negative zeros', () => {
  const { state, members } = setup();
  members.scale.value(-2, -1);
  const actual = matrixOf(state);
  assert.deepEqual(actual, [-2, -0, -0, -1, 0, 0]);
  assert.ok(Object.is(actual[1], -0) && Object.is(actual[2], -0));
});

test('non-finite transform arguments are ignored without throwing', () => {
  const { state, members } = setup();
  members.translate.value(NaN, 0);
  members.translate.value(1, Infinity);
  members.rotate.value(NaN);
  members.scale.value(1, NaN);
  members.setTransform.value(1, 0, 0, NaN, 0, 0);
  assert.deepEqual(matrixOf(state), [1, 0, 0, 1, 0, 0]);
  members.translate.value('3', '4');
  assert.deepEqual(matrixOf(state), [1, 0, 0, 1, 3, 4]);
});

test('missing arguments throw native TypeErrors', () => {
  const { members } = setup();
  assert.throws(() => members.translate.value(1), TypeError);
  assert.throws(() => members.translate.value(), TypeError);
  assert.throws(() => members.rotate.value(), TypeError);
  assert.throws(() => members.scale.value(2), TypeError);
  assert.throws(() => members.setTransform.value(1, 2, 3, 4, 5), TypeError);
});

test('setTransform overload handling: 6-arity path, unapproved forms, TypeErrors', () => {
  const { state, members } = setup();
  members.setTransform.value(1, 0, 0, 1, 8, 9, 'ignored');
  assert.deepEqual(matrixOf(state), [1, 0, 0, 1, 8, 9]);
  assert.throws(() => members.setTransform.value(), { code: 'unsupported-api' });
  assert.throws(() => members.setTransform.value({ a: 2, d: 2 }), { code: 'unsupported-api' });
  assert.throws(() => members.setTransform.value(undefined), { code: 'unsupported-api' });
  assert.throws(() => members.setTransform.value(5), TypeError);
  assert.throws(() => members.setTransform.value('matrix'), TypeError);
  assert.deepEqual(matrixOf(state), [1, 0, 0, 1, 8, 9]);
});

test('save/restore through the feature carries transform and properties', () => {
  const { state, members } = setup();
  members.translate.value(10, 20);
  members.globalAlpha.set(0.5);
  members.save.value();
  members.scale.value(2, 2);
  members.globalAlpha.set(0.1);
  members.restore.value();
  assert.deepEqual(matrixOf(state), [1, 0, 0, 1, 10, 20]);
  assert.equal(members.globalAlpha.get(), 0.5);
  members.restore.value();
  assert.equal(members.globalAlpha.get(), 0.5);
});

test('the factory requires a state store in the environment', () => {
  assert.throws(() => stateFeature({}), { code: 'contract-violation' });
});
