import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyColorValue,
  formatAlpha,
  parseSupportedColor,
} from "../../../dist/paint/color.js";

// Expected values are Chromium probe evidence recorded on issue #15.

test("hex colors parse and canonicalize like native", () => {
  const cases = [
    ["#abcdef", "#abcdef", [0xab, 0xcd, 0xef, 255]],
    ["#AbCdEf", "#abcdef", [0xab, 0xcd, 0xef, 255]],
    ["#abc", "#aabbcc", [0xaa, 0xbb, 0xcc, 255]],
    ["#abcd", "rgba(170, 187, 204, 0.867)", [0xaa, 0xbb, 0xcc, 0xdd]],
    ["#aabbccdd", "rgba(170, 187, 204, 0.867)", [0xaa, 0xbb, 0xcc, 0xdd]],
    ["#000000", "#000000", [0, 0, 0, 255]],
  ];
  for (const [input, canonical, bytes] of cases) {
    const parsed = parseSupportedColor(input);
    assert.ok(parsed, input);
    assert.equal(parsed.canonical, canonical, input);
    const [r, g, b, a] = bytes;
    assert.deepEqual(
      parsed.color.map((channel) => Math.round(channel * 255)),
      [r, g, b, a],
      input,
    );
  }
});

test("legacy comma rgb()/rgba() parse with native clamping and rounding", () => {
  const cases = [
    ["rgb(10,20,30)", "#0a141e"],
    ["rgb(100%,0%,50%)", "#ff0080"],
    ["rgb(1.5,2.5,3.5)", "#020304"],
    ["rgb(300,-5,10)", "#ff000a"],
    ["rgb(1e2,2,3)", "#640203"],
    ["  RGB( 1 , 2 , 3 )  ", "#010203"],
    ["rgba(1,2,3)", "#010203"],
    ["rgba(1,2,3,1)", "#010203"],
    ["rgba(0,0,0,2)", "#000000"],
    ["rgba(0,0,0,0.999)", "#000000"],
    ["rgb(1,2,3,0.5)", "rgba(1, 2, 3, 0.5)"],
    ["rgb(1,2,3,50%)", "rgba(1, 2, 3, 0.5)"],
    ["rgba(255,120,40,0.5)", "rgba(255, 120, 40, 0.5)"],
    ["rgba(0,0,0,0.333)", "rgba(0, 0, 0, 0.333)"],
    ["rgba(0,0,0,-1)", "rgba(0, 0, 0, 0)"],
    ["rgba(0,0,0,0.004)", "rgba(0, 0, 0, 0.004)"],
    ["rgba(0,0,0,0.1234)", "rgba(0, 0, 0, 0.12)"],
  ];
  for (const [input, canonical] of cases) {
    const parsed = parseSupportedColor(input);
    assert.ok(parsed, input);
    assert.equal(parsed.canonical, canonical, input);
  }
});

test("invalid strings are rejected, never clamped into scope", () => {
  const invalid = [
    "",
    "not-a-color",
    "#ab",
    "#abcde",
    "#ggg",
    "rgb(1,2)",
    "rgb(1,2,3,)",
    "rgb(50%,128,0)",
    "rgb(NaN,2,3)",
    "rgb(Infinity,2,3)",
    "rgb(calc(50% - 10%),2,3)",
    "rgb(none,2,3)",
    "rgb(1, 2, 3 / 0.5)",
    "rgb(1,2,3,4,5)",
    "rgb[1,2,3]",
    "inherit",
  ];
  for (const input of invalid) {
    assert.equal(parseSupportedColor(input), null, input);
    assert.equal(classifyColorValue(input), "invalid", input);
  }
});

test("legal CSS colors outside the matrix classify as unsupported", () => {
  const unsupported = [
    "red",
    "ReBeccAPurple",
    "transparent",
    "hsl(120,50%,50%)",
    "hsla(120,50%,50%,0.5)",
    "hsl(120deg 50% 50%)",
    "hsl(0.5turn 50% 50% / 0.5)",
    "hwb(120 50% 50%)",
    "rgb(1 2 3)",
    "rgb(1 2 3 / 50%)",
    "rgba(1 2 3 / 0.5)",
    "rgb(none 2 3)",
    "lab(50% 40 59.5)",
    "lch(52% 132 50)",
    "oklab(0.6 0.1 0.1)",
    "oklch(0.7 0.1 150deg)",
    "color(display-p3 1 0 0)",
    "color(srgb 1 0 0 / 0.5)",
  ];
  for (const input of unsupported) {
    assert.equal(parseSupportedColor(input), null, input);
    assert.equal(classifyColorValue(input), "unsupported", input);
  }
  assert.equal(classifyColorValue("#abc"), "supported");
  assert.equal(classifyColorValue("rgba(1,2,3,0.5)"), "supported");
});

test("formatAlpha serializes the shortest 8-bit round-trip decimal", () => {
  const cases = [
    [0, "0"],
    [1, "0.004"],
    [13, "0.05"],
    [26, "0.1"],
    [51, "0.2"],
    [64, "0.25"],
    [85, "0.333"],
    [128, "0.5"],
    [221, "0.867"],
  ];
  for (const [byte, expected] of cases) {
    assert.equal(formatAlpha(byte), expected, String(byte));
  }
});
