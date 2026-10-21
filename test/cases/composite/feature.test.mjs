import test from "node:test";
import assert from "node:assert/strict";
import { compositeFeature } from "../../../dist/features/composite/feature.js";
import { createStateStore } from "../../../dist/context/state.js";

function stubPaint(id) {
  return {
    id,
    version: 0,
    snapshot() {
      return Object.freeze({
        kind: "solid",
        color: Object.freeze([0, 0, 0, 1]),
      });
    },
  };
}

function setup() {
  const state = createStateStore({ fill: stubPaint(1), stroke: stubPaint(2) });
  const feature = compositeFeature({ state });
  assert.equal(feature.id, "composite");
  const get = (name) => feature.members[name].get.call(undefined);
  const set = (name, value) => feature.members[name].set.call(undefined, value);
  return { state, get, set, members: feature.members };
}

test("the factory requires environment.state", () => {
  assert.throws(() => compositeFeature({}), { code: "contract-violation" });
});

test("globalCompositeOperation defaults to source-over and round-trips supported values", () => {
  const { get, set } = setup();
  assert.equal(get("globalCompositeOperation"), "source-over");
  for (const mode of ["source-atop", "source-in", "lighter", "source-over"]) {
    set("globalCompositeOperation", mode);
    assert.equal(get("globalCompositeOperation"), mode);
  }
});

test("filter defaults to none and round-trips the supported values", () => {
  const { get, set } = setup();
  assert.equal(get("filter"), "none");
  set("filter", "brightness(120%)");
  assert.equal(get("filter"), "brightness(120%)");
  set("filter", "none");
  assert.equal(get("filter"), "none");
});

test("composite and filter participate in the state stack and land in draw snapshots", () => {
  const { state, set } = setup();
  set("globalCompositeOperation", "source-in");
  set("filter", "brightness(120%)");
  state.save();
  set("globalCompositeOperation", "lighter");
  set("filter", "none");
  assert.equal(state.snapshot().composite, "lighter");
  assert.equal(state.snapshot().filter, "none");
  state.restore();
  assert.equal(state.snapshot().composite, "source-in");
  assert.equal(state.snapshot().filter, "brightness(120%)");
});

test("spec-recognized composite modes outside the matrix are reported, value unchanged", () => {
  const { get, set } = setup();
  set("globalCompositeOperation", "source-atop");
  for (const mode of [
    "clear",
    "copy",
    "destination-over",
    "destination-in",
    "destination-out",
    "destination-atop",
    "source-out",
    "xor",
    "multiply",
    "screen",
    "overlay",
    "darken",
    "lighten",
    "color-dodge",
    "color-burn",
    "hard-light",
    "soft-light",
    "difference",
    "exclusion",
    "hue",
    "saturation",
    "color",
    "luminosity",
  ]) {
    assert.throws(
      () => set("globalCompositeOperation", mode),
      {
        code: "unsupported-api",
      },
      mode,
    );
    assert.equal(get("globalCompositeOperation"), "source-atop", mode);
  }
});

test("the CSS normal spelling aliases source-over like Chromium", () => {
  const { get, set } = setup();
  set("globalCompositeOperation", "lighter");
  set("globalCompositeOperation", "normal");
  assert.equal(get("globalCompositeOperation"), "source-over");
  set("globalCompositeOperation", "source-in");
  set("globalCompositeOperation", "normal");
  assert.equal(get("globalCompositeOperation"), "source-over");
});

test("unrecognized composite spellings are silently ignored like native", () => {
  const { get, set } = setup();
  set("globalCompositeOperation", "lighter");
  // Only the exact lowercase "normal" aliases source-over; case and
  // whitespace variants stay unknown, like native.
  for (const junk of [
    "garbage",
    "Normal",
    "NORMAL",
    " normal ",
    "source_over",
    "SOURCE-OVER",
    "",
    " source-over ",
    "null",
  ]) {
    set("globalCompositeOperation", junk);
    assert.equal(
      get("globalCompositeOperation"),
      "lighter",
      JSON.stringify(junk),
    );
  }
  for (const junk of [undefined, null, 42, {}, ["lighter"]]) {
    set("globalCompositeOperation", junk);
    assert.equal(get("globalCompositeOperation"), "lighter", String(junk));
  }
  // ['lighter'] stringifies to 'lighter' and is therefore accepted like native.
  assert.equal(get("globalCompositeOperation"), "lighter");
});

test("Symbol values reject with a native TypeError on both properties", () => {
  const { get, set } = setup();
  assert.throws(() => set("globalCompositeOperation", Symbol("x")), TypeError);
  assert.throws(() => set("filter", Symbol("x")), TypeError);
  assert.equal(get("globalCompositeOperation"), "source-over");
  assert.equal(get("filter"), "none");
});

test("filter classification requires a native parser when no factory is supplied", () => {
  const { get, set } = setup();
  assert.throws(() => set("filter", "blur()"), {
    code: "capability-unavailable",
  });
  assert.equal(get("filter"), "none");
});

test("a disposed canvas classifies filter values without caching a new parser", () => {
  const state = createStateStore({ fill: stubPaint(1), stroke: stubPaint(2) });
  const context = { filter: "none" };
  const canvas = { width: 1, height: 1, getContext: () => context };
  let registrations = 0;
  const feature = compositeFeature({
    state,
    gpu: { status: "disposed" },
    createOffscreenCanvas: () => canvas,
    resources: {
      register() {
        registrations += 1;
        return () => {};
      },
    },
  });
  const setFilter = (value) =>
    feature.members.filter.set.call(undefined, value);
  assert.throws(() => setFilter("blur(5px)"), { code: "unsupported-api" });
  assert.equal(
    registrations,
    0,
    "the drained owner never receives another cleanup",
  );
  assert.equal(
    canvas.width,
    0,
    "the throwaway parser canvas is released immediately",
  );
});

test("coerced values follow WebIDL DOMString conversion", () => {
  const { get, set } = setup();
  set("globalCompositeOperation", { toString: () => "source-in" });
  assert.equal(get("globalCompositeOperation"), "source-in");
  set("filter", { toString: () => "none" });
  assert.equal(get("filter"), "none");
});
