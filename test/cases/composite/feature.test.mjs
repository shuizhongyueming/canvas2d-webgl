import test from 'node:test';
import assert from 'node:assert/strict';
import { compositeFeature } from '../../../dist/features/composite/feature.js';
import { createStateStore } from '../../../dist/context/state.js';

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
  const state = createStateStore({ fill: stubPaint(1), stroke: stubPaint(2) });
  const feature = compositeFeature({ state });
  assert.equal(feature.id, 'composite');
  const get = (name) => feature.members[name].get.call(undefined);
  const set = (name, value) => feature.members[name].set.call(undefined, value);
  return { state, get, set, members: feature.members };
}

test('the factory requires environment.state', () => {
  assert.throws(() => compositeFeature({}), { code: 'contract-violation' });
});

test('globalCompositeOperation defaults to source-over and round-trips supported values', () => {
  const { get, set } = setup();
  assert.equal(get('globalCompositeOperation'), 'source-over');
  for (const mode of ['source-atop', 'source-in', 'lighter', 'source-over']) {
    set('globalCompositeOperation', mode);
    assert.equal(get('globalCompositeOperation'), mode);
  }
});

test('filter defaults to none and round-trips the supported values', () => {
  const { get, set } = setup();
  assert.equal(get('filter'), 'none');
  set('filter', 'brightness(120%)');
  assert.equal(get('filter'), 'brightness(120%)');
  set('filter', 'none');
  assert.equal(get('filter'), 'none');
});

test('composite and filter participate in the state stack and land in draw snapshots', () => {
  const { state, set } = setup();
  set('globalCompositeOperation', 'source-in');
  set('filter', 'brightness(120%)');
  state.save();
  set('globalCompositeOperation', 'lighter');
  set('filter', 'none');
  assert.equal(state.snapshot().composite, 'lighter');
  assert.equal(state.snapshot().filter, 'none');
  state.restore();
  assert.equal(state.snapshot().composite, 'source-in');
  assert.equal(state.snapshot().filter, 'brightness(120%)');
});

test('spec-recognized composite modes outside the matrix are reported, value unchanged', () => {
  const { get, set } = setup();
  set('globalCompositeOperation', 'source-atop');
  for (const mode of [
    'clear', 'copy', 'destination', 'destination-over', 'destination-in',
    'destination-out', 'destination-atop', 'source-out', 'xor', 'normal',
    'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge',
    'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion',
    'hue', 'saturation', 'color', 'luminosity', 'plus-darker', 'plus-lighter',
  ]) {
    assert.throws(() => set('globalCompositeOperation', mode), {
      code: 'unsupported-api',
    }, mode);
    assert.equal(get('globalCompositeOperation'), 'source-atop', mode);
  }
});

test('unrecognized composite spellings are silently ignored like native', () => {
  const { get, set } = setup();
  set('globalCompositeOperation', 'lighter');
  for (const junk of ['garbage', 'source_over', 'SOURCE-OVER', '', ' source-over ', 'null']) {
    set('globalCompositeOperation', junk);
    assert.equal(get('globalCompositeOperation'), 'lighter', JSON.stringify(junk));
  }
  for (const junk of [undefined, null, 42, {}, ['lighter']]) {
    set('globalCompositeOperation', junk);
    assert.equal(get('globalCompositeOperation'), 'lighter', String(junk));
  }
  // ['lighter'] stringifies to 'lighter' and is therefore accepted like native.
  assert.equal(get('globalCompositeOperation'), 'lighter');
});

test('Symbol values reject with a native TypeError on both properties', () => {
  const { get, set } = setup();
  assert.throws(() => set('globalCompositeOperation', Symbol('x')), TypeError);
  assert.throws(() => set('filter', Symbol('x')), TypeError);
  assert.equal(get('globalCompositeOperation'), 'source-over');
  assert.equal(get('filter'), 'none');
});

test('spec-legal filter lists outside the matrix are reported, value unchanged', () => {
  const { get, set } = setup();
  for (const filter of [
    'blur(5px)', 'brightness(50%)', 'brightness(1.2)', 'contrast(2)',
    'grayscale(100%)', 'invert(0.4)', 'opacity(0.5)', 'saturate(3)',
    'sepia(1)', 'hue-rotate(90deg)', 'drop-shadow(2px 2px 4px black)',
    'url(#soft)', 'Brightness(120%)', 'brightness( 120% )',
    'brightness(120%) blur(5px)',
  ]) {
    assert.throws(() => set('filter', filter), { code: 'unsupported-api' }, filter);
    assert.equal(get('filter'), 'none', filter);
  }
});

test('unparseable filter values are silently ignored like native', () => {
  const { get, set } = setup();
  set('filter', 'brightness(120%)');
  for (const junk of [
    '', ' ', 'asdf', '123', 'brightness', 'brightness()', 'brightness(120%',
    'brightness 120%', 'brightness(120%)garbage', 'blur()', 'blur(abc)',
    'hue-rotate(90)', 'unknown-fn(1)', 'none brightness(120%)',
  ]) {
    set('filter', junk);
    assert.equal(get('filter'), 'brightness(120%)', JSON.stringify(junk));
  }
  for (const junk of [undefined, null, 42, {}]) {
    set('filter', junk);
    assert.equal(get('filter'), 'brightness(120%)', String(junk));
  }
});

test('coerced values follow WebIDL DOMString conversion', () => {
  const { get, set } = setup();
  set('globalCompositeOperation', { toString: () => 'source-in' });
  assert.equal(get('globalCompositeOperation'), 'source-in');
  set('filter', { toString: () => 'none' });
  assert.equal(get('filter'), 'none');
});
