import test from 'node:test';
import assert from 'node:assert/strict';
import { createStateStore } from '../../../dist/context/state.js';
import { stateFeature } from '../../../dist/context/feature.js';
import { createContext } from '../../../dist/context/context.js';

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
  const environment = { state: createStateStore({ fill: stubPaint(0), stroke: stubPaint(1) }) };
  return createContext(environment, [stateFeature]);
}

test('registered state members work on the assembled context', () => {
  const context = setup();
  context.translate(10, 20);
  context.globalAlpha = 0.5;
  context.lineJoin = 'round';
  context.save();
  context.globalAlpha = 0.2;
  context.restore();
  assert.equal(context.globalAlpha, 0.5);
  assert.equal(context.lineJoin, 'round');
});

test('unimplemented supported members and excluded members report distinctly', () => {
  const context = setup();
  assert.throws(() => context.fillRect(0, 0, 1, 1), { code: 'not-implemented' });
  assert.throws(() => context.getImageData(0, 0, 1, 1), { code: 'unsupported-api' });
  assert.throws(() => context.shadowBlur, { code: 'unsupported-api' });
  assert.throws(() => { context.shadowBlur = 2; }, { code: 'unsupported-api' });
  assert.throws(() => context.canvas, { code: 'not-implemented' });
});

test('spec-external spellings stay absent with native behavior', () => {
  const context = setup();
  assert.equal(context.fillRekt, undefined);
  assert.throws(() => context.fillRekt(), TypeError);
  assert.equal('save' in context, true);
  assert.equal('savee' in context, false);
});

test('installed members are enumerable, non-configurable and methods non-writable', () => {
  const context = setup();
  const save = Object.getOwnPropertyDescriptor(context, 'save');
  assert.equal(save.enumerable, true);
  assert.equal(save.configurable, false);
  assert.equal(save.writable, false);
  const alpha = Object.getOwnPropertyDescriptor(context, 'globalAlpha');
  assert.equal(alpha.enumerable, true);
  assert.equal(alpha.configurable, false);
  assert.equal(typeof alpha.get, 'function');
  assert.equal(typeof alpha.set, 'function');
  const canvas = Object.getOwnPropertyDescriptor(context, 'canvas');
  assert.equal(canvas.set, undefined);
  assert.throws(() => { context.canvas = {}; }, TypeError);
});

test('a context without the state feature reports not-implemented for state members', () => {
  const environment = { state: createStateStore({ fill: stubPaint(0), stroke: stubPaint(1) }) };
  const context = createContext(environment, []);
  assert.throws(() => context.save(), { code: 'not-implemented' });
  assert.throws(() => context.globalAlpha, { code: 'not-implemented' });
});
