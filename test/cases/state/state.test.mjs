import test from 'node:test';
import assert from 'node:assert/strict';
import { createStateStore } from '../../../dist/context/state.js';

function stubPaint(id, color = [0, 0, 0, 1]) {
  const ref = {
    id,
    version: 0,
    color,
    snapshot() {
      return Object.freeze({ kind: 'solid', color: Object.freeze([...ref.color]) });
    },
  };
  return ref;
}

function store(defaults) {
  return createStateStore(defaults ?? { fill: stubPaint(0), stroke: stubPaint(1) });
}

test('initial state carries the native defaults', () => {
  const s = store();
  const snap = s.snapshot();
  assert.deepEqual([...snap.transform], [1, 0, 0, 1, 0, 0]);
  assert.equal(snap.alpha, 1);
  assert.equal(snap.composite, 'source-over');
  assert.equal(snap.filter, 'none');
  assert.equal(snap.lineWidth, 1);
  assert.equal(snap.lineCap, 'butt');
  assert.equal(snap.lineJoin, 'miter');
  assert.equal(snap.font, '10px sans-serif');
  assert.equal(snap.textAlign, 'start');
  assert.equal(snap.textBaseline, 'alphabetic');
  assert.equal(snap.clip, null);
  assert.deepEqual(snap.fill, { kind: 'solid', color: [0, 0, 0, 1] });
  assert.deepEqual(snap.stroke, { kind: 'solid', color: [0, 0, 0, 1] });
});

test('set/get round-trips and unknown fields are contract violations', () => {
  const s = store();
  s.set('alpha', 0.5);
  assert.equal(s.get('alpha'), 0.5);
  s.set('composite', 'lighter');
  assert.equal(s.get('composite'), 'lighter');
  assert.throws(() => s.set('globAlpha', 1), { code: 'contract-violation' });
  assert.throws(() => s.get('globAlpha'), { code: 'contract-violation' });
  assert.throws(() => s.set('transform', [1, 0, 0]), { code: 'contract-violation' });
  assert.throws(() => s.set('fill', { kind: 'solid' }), { code: 'contract-violation' });
});

test('the store copies transforms on set and on snapshot', () => {
  const s = store();
  const input = [1, 0, 0, 1, 5, 6];
  s.set('transform', input);
  input[4] = 99;
  assert.deepEqual([...s.snapshot().transform], [1, 0, 0, 1, 5, 6]);
  const snap = s.snapshot();
  s.set('transform', [2, 0, 0, 2, 0, 0]);
  assert.deepEqual([...snap.transform], [1, 0, 0, 1, 5, 6]);
});

test('save/restore nests and keeps paint and clip references alive', () => {
  const fill = stubPaint(0);
  const s = store({ fill, stroke: stubPaint(1) });
  s.set('alpha', 0.5);
  s.save();
  s.set('alpha', 0.2);
  s.set('fill', stubPaint(2, [1, 0, 0, 1]));
  const clip = { id: 7, parent: null, path: { id: 3, commands: [] }, rule: 'evenodd' };
  s.set('clip', clip);
  s.save();
  s.set('alpha', 0.1);
  s.set('clip', null);
  s.restore();
  assert.equal(s.get('alpha'), 0.2);
  assert.equal(s.get('clip'), clip);
  s.restore();
  assert.equal(s.get('alpha'), 0.5);
  assert.equal(s.get('fill'), fill);
  assert.equal(s.get('clip'), null);
});

test('restore with an empty stack is a no-op', () => {
  const s = store();
  s.restore();
  s.restore();
  assert.equal(s.get('alpha'), 1);
  s.save();
  s.restore();
  s.restore();
  assert.equal(s.get('alpha'), 1);
});

test('snapshot captures the paint version at draw time only', () => {
  const fill = stubPaint(0);
  const s = store({ fill, stroke: stubPaint(1) });
  fill.color = [1, 0, 0, 1];
  fill.version = 1;
  const first = s.snapshot();
  fill.color = [0, 0, 1, 1];
  fill.version = 2;
  assert.deepEqual(first.fill, { kind: 'solid', color: [1, 0, 0, 1] });
  assert.deepEqual(s.snapshot().fill, { kind: 'solid', color: [0, 0, 1, 1] });
});

test('restore returns the live paint reference, not a frozen copy', () => {
  const fill = stubPaint(0);
  const s = store({ fill, stroke: stubPaint(1) });
  s.save();
  fill.color = [0, 1, 0, 1];
  fill.version = 5;
  s.restore();
  assert.equal(s.get('fill'), fill);
  assert.deepEqual(s.snapshot().fill, { kind: 'solid', color: [0, 1, 0, 1] });
});

test('reset restores native defaults and clears the stack', () => {
  const fill = stubPaint(0);
  const stroke = stubPaint(1);
  const s = store({ fill, stroke });
  s.set('alpha', 0.3);
  s.set('lineJoin', 'round');
  s.set('transform', [2, 0, 0, 2, 9, 9]);
  s.set('clip', { id: 1, parent: null, path: { id: 2, commands: [] }, rule: 'nonzero' });
  s.save();
  s.reset();
  const snap = s.snapshot();
  assert.equal(snap.alpha, 1);
  assert.equal(snap.lineJoin, 'miter');
  assert.equal(snap.clip, null);
  assert.deepEqual([...snap.transform], [1, 0, 0, 1, 0, 0]);
  assert.equal(s.get('fill'), fill);
  assert.equal(s.get('stroke'), stroke);
  s.restore();
  assert.equal(s.get('alpha'), 1);
});

test('snapshots are immutable and independent of later state', () => {
  const s = store();
  const snap = s.snapshot();
  assert.ok(Object.isFrozen(snap));
  assert.ok(Object.isFrozen(snap.transform));
  assert.throws(() => { snap.alpha = 0.1; }, TypeError);
  s.set('alpha', 0.4);
  assert.equal(snap.alpha, 1);
});
