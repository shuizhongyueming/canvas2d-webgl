import test from "node:test";
import assert from "node:assert/strict";
import {
  REPEAT_PATTERN_GLSL,
  REPEAT_PATTERN_WRAP_S,
  REPEAT_PATTERN_WRAP_T,
  repeatUv,
} from "../../../dist/paint/shader.js";

test("NPOT tiling lives in the shader, texture wrap stays CLAMP_TO_EDGE", () => {
  const CLAMP_TO_EDGE = 0x812f;
  const REPEAT = 0x2901;
  const MIRRORED_REPEAT = 0x8370;
  assert.equal(REPEAT_PATTERN_WRAP_S, CLAMP_TO_EDGE);
  assert.equal(REPEAT_PATTERN_WRAP_T, CLAMP_TO_EDGE);
  assert.notEqual(REPEAT_PATTERN_WRAP_S, REPEAT);
  assert.notEqual(REPEAT_PATTERN_WRAP_S, MIRRORED_REPEAT);
  assert.match(REPEAT_PATTERN_GLSL, /fract\(patternUv\)/);
  assert.match(REPEAT_PATTERN_GLSL, /texture2D\(/);
});

test("repeatUv matches GLSL fract() semantics, including negatives", () => {
  assert.deepEqual(repeatUv(0.25, 1.5), [0.25, 0.5]);
  assert.deepEqual(repeatUv(-0.25, -1.25), [0.75, 0.75]);
  assert.deepEqual(repeatUv(0, 3), [0, 0]);
  const [u] = repeatUv(-1 / 4, 0);
  assert.equal(u, 0.75, "phase after translate(-1) wraps to the last texel column");
});
