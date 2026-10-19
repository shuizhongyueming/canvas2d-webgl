import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalColorString,
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

// Chromium probe: fillStyle serialization of #000000XX for every alpha byte.
const NATIVE_ALPHA_TABLE = [
  "rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0.004)", "rgba(0, 0, 0, 0.008)", "rgba(0, 0, 0, 0.01)",
  "rgba(0, 0, 0, 0.016)", "rgba(0, 0, 0, 0.02)", "rgba(0, 0, 0, 0.024)", "rgba(0, 0, 0, 0.027)",
  "rgba(0, 0, 0, 0.03)", "rgba(0, 0, 0, 0.035)", "rgba(0, 0, 0, 0.04)", "rgba(0, 0, 0, 0.043)",
  "rgba(0, 0, 0, 0.047)", "rgba(0, 0, 0, 0.05)", "rgba(0, 0, 0, 0.055)", "rgba(0, 0, 0, 0.06)",
  "rgba(0, 0, 0, 0.063)", "rgba(0, 0, 0, 0.067)", "rgba(0, 0, 0, 0.07)", "rgba(0, 0, 0, 0.075)",
  "rgba(0, 0, 0, 0.08)", "rgba(0, 0, 0, 0.082)", "rgba(0, 0, 0, 0.086)", "rgba(0, 0, 0, 0.09)",
  "rgba(0, 0, 0, 0.094)", "rgba(0, 0, 0, 0.098)", "rgba(0, 0, 0, 0.1)", "rgba(0, 0, 0, 0.106)",
  "rgba(0, 0, 0, 0.11)", "rgba(0, 0, 0, 0.114)", "rgba(0, 0, 0, 0.118)", "rgba(0, 0, 0, 0.12)",
  "rgba(0, 0, 0, 0.125)", "rgba(0, 0, 0, 0.13)", "rgba(0, 0, 0, 0.133)", "rgba(0, 0, 0, 0.137)",
  "rgba(0, 0, 0, 0.14)", "rgba(0, 0, 0, 0.145)", "rgba(0, 0, 0, 0.15)", "rgba(0, 0, 0, 0.153)",
  "rgba(0, 0, 0, 0.157)", "rgba(0, 0, 0, 0.16)", "rgba(0, 0, 0, 0.165)", "rgba(0, 0, 0, 0.17)",
  "rgba(0, 0, 0, 0.173)", "rgba(0, 0, 0, 0.176)", "rgba(0, 0, 0, 0.18)", "rgba(0, 0, 0, 0.184)",
  "rgba(0, 0, 0, 0.19)", "rgba(0, 0, 0, 0.192)", "rgba(0, 0, 0, 0.196)", "rgba(0, 0, 0, 0.2)",
  "rgba(0, 0, 0, 0.204)", "rgba(0, 0, 0, 0.208)", "rgba(0, 0, 0, 0.21)", "rgba(0, 0, 0, 0.216)",
  "rgba(0, 0, 0, 0.22)", "rgba(0, 0, 0, 0.224)", "rgba(0, 0, 0, 0.227)", "rgba(0, 0, 0, 0.23)",
  "rgba(0, 0, 0, 0.235)", "rgba(0, 0, 0, 0.24)", "rgba(0, 0, 0, 0.243)", "rgba(0, 0, 0, 0.247)",
  "rgba(0, 0, 0, 0.25)", "rgba(0, 0, 0, 0.255)", "rgba(0, 0, 0, 0.26)", "rgba(0, 0, 0, 0.263)",
  "rgba(0, 0, 0, 0.267)", "rgba(0, 0, 0, 0.27)", "rgba(0, 0, 0, 0.275)", "rgba(0, 0, 0, 0.28)",
  "rgba(0, 0, 0, 0.282)", "rgba(0, 0, 0, 0.286)", "rgba(0, 0, 0, 0.29)", "rgba(0, 0, 0, 0.294)",
  "rgba(0, 0, 0, 0.298)", "rgba(0, 0, 0, 0.3)", "rgba(0, 0, 0, 0.306)", "rgba(0, 0, 0, 0.31)",
  "rgba(0, 0, 0, 0.314)", "rgba(0, 0, 0, 0.318)", "rgba(0, 0, 0, 0.32)", "rgba(0, 0, 0, 0.325)",
  "rgba(0, 0, 0, 0.33)", "rgba(0, 0, 0, 0.333)", "rgba(0, 0, 0, 0.337)", "rgba(0, 0, 0, 0.34)",
  "rgba(0, 0, 0, 0.345)", "rgba(0, 0, 0, 0.35)", "rgba(0, 0, 0, 0.353)", "rgba(0, 0, 0, 0.357)",
  "rgba(0, 0, 0, 0.36)", "rgba(0, 0, 0, 0.365)", "rgba(0, 0, 0, 0.37)", "rgba(0, 0, 0, 0.373)",
  "rgba(0, 0, 0, 0.376)", "rgba(0, 0, 0, 0.38)", "rgba(0, 0, 0, 0.384)", "rgba(0, 0, 0, 0.39)",
  "rgba(0, 0, 0, 0.392)", "rgba(0, 0, 0, 0.396)", "rgba(0, 0, 0, 0.4)", "rgba(0, 0, 0, 0.404)",
  "rgba(0, 0, 0, 0.408)", "rgba(0, 0, 0, 0.41)", "rgba(0, 0, 0, 0.416)", "rgba(0, 0, 0, 0.42)",
  "rgba(0, 0, 0, 0.424)", "rgba(0, 0, 0, 0.427)", "rgba(0, 0, 0, 0.43)", "rgba(0, 0, 0, 0.435)",
  "rgba(0, 0, 0, 0.44)", "rgba(0, 0, 0, 0.443)", "rgba(0, 0, 0, 0.447)", "rgba(0, 0, 0, 0.45)",
  "rgba(0, 0, 0, 0.455)", "rgba(0, 0, 0, 0.46)", "rgba(0, 0, 0, 0.463)", "rgba(0, 0, 0, 0.467)",
  "rgba(0, 0, 0, 0.47)", "rgba(0, 0, 0, 0.475)", "rgba(0, 0, 0, 0.48)", "rgba(0, 0, 0, 0.482)",
  "rgba(0, 0, 0, 0.486)", "rgba(0, 0, 0, 0.49)", "rgba(0, 0, 0, 0.494)", "rgba(0, 0, 0, 0.498)",
  "rgba(0, 0, 0, 0.5)", "rgba(0, 0, 0, 0.506)", "rgba(0, 0, 0, 0.51)", "rgba(0, 0, 0, 0.514)",
  "rgba(0, 0, 0, 0.518)", "rgba(0, 0, 0, 0.52)", "rgba(0, 0, 0, 0.525)", "rgba(0, 0, 0, 0.53)",
  "rgba(0, 0, 0, 0.533)", "rgba(0, 0, 0, 0.537)", "rgba(0, 0, 0, 0.54)", "rgba(0, 0, 0, 0.545)",
  "rgba(0, 0, 0, 0.55)", "rgba(0, 0, 0, 0.553)", "rgba(0, 0, 0, 0.557)", "rgba(0, 0, 0, 0.56)",
  "rgba(0, 0, 0, 0.565)", "rgba(0, 0, 0, 0.57)", "rgba(0, 0, 0, 0.573)", "rgba(0, 0, 0, 0.576)",
  "rgba(0, 0, 0, 0.58)", "rgba(0, 0, 0, 0.584)", "rgba(0, 0, 0, 0.59)", "rgba(0, 0, 0, 0.592)",
  "rgba(0, 0, 0, 0.596)", "rgba(0, 0, 0, 0.6)", "rgba(0, 0, 0, 0.604)", "rgba(0, 0, 0, 0.608)",
  "rgba(0, 0, 0, 0.61)", "rgba(0, 0, 0, 0.616)", "rgba(0, 0, 0, 0.62)", "rgba(0, 0, 0, 0.624)",
  "rgba(0, 0, 0, 0.627)", "rgba(0, 0, 0, 0.63)", "rgba(0, 0, 0, 0.635)", "rgba(0, 0, 0, 0.64)",
  "rgba(0, 0, 0, 0.643)", "rgba(0, 0, 0, 0.647)", "rgba(0, 0, 0, 0.65)", "rgba(0, 0, 0, 0.655)",
  "rgba(0, 0, 0, 0.66)", "rgba(0, 0, 0, 0.663)", "rgba(0, 0, 0, 0.667)", "rgba(0, 0, 0, 0.67)",
  "rgba(0, 0, 0, 0.675)", "rgba(0, 0, 0, 0.68)", "rgba(0, 0, 0, 0.682)", "rgba(0, 0, 0, 0.686)",
  "rgba(0, 0, 0, 0.69)", "rgba(0, 0, 0, 0.694)", "rgba(0, 0, 0, 0.698)", "rgba(0, 0, 0, 0.7)",
  "rgba(0, 0, 0, 0.706)", "rgba(0, 0, 0, 0.71)", "rgba(0, 0, 0, 0.714)", "rgba(0, 0, 0, 0.718)",
  "rgba(0, 0, 0, 0.72)", "rgba(0, 0, 0, 0.725)", "rgba(0, 0, 0, 0.73)", "rgba(0, 0, 0, 0.733)",
  "rgba(0, 0, 0, 0.737)", "rgba(0, 0, 0, 0.74)", "rgba(0, 0, 0, 0.745)", "rgba(0, 0, 0, 0.75)",
  "rgba(0, 0, 0, 0.753)", "rgba(0, 0, 0, 0.757)", "rgba(0, 0, 0, 0.76)", "rgba(0, 0, 0, 0.765)",
  "rgba(0, 0, 0, 0.77)", "rgba(0, 0, 0, 0.773)", "rgba(0, 0, 0, 0.776)", "rgba(0, 0, 0, 0.78)",
  "rgba(0, 0, 0, 0.784)", "rgba(0, 0, 0, 0.79)", "rgba(0, 0, 0, 0.792)", "rgba(0, 0, 0, 0.796)",
  "rgba(0, 0, 0, 0.8)", "rgba(0, 0, 0, 0.804)", "rgba(0, 0, 0, 0.808)", "rgba(0, 0, 0, 0.81)",
  "rgba(0, 0, 0, 0.816)", "rgba(0, 0, 0, 0.82)", "rgba(0, 0, 0, 0.824)", "rgba(0, 0, 0, 0.827)",
  "rgba(0, 0, 0, 0.83)", "rgba(0, 0, 0, 0.835)", "rgba(0, 0, 0, 0.84)", "rgba(0, 0, 0, 0.843)",
  "rgba(0, 0, 0, 0.847)", "rgba(0, 0, 0, 0.85)", "rgba(0, 0, 0, 0.855)", "rgba(0, 0, 0, 0.86)",
  "rgba(0, 0, 0, 0.863)", "rgba(0, 0, 0, 0.867)", "rgba(0, 0, 0, 0.87)", "rgba(0, 0, 0, 0.875)",
  "rgba(0, 0, 0, 0.88)", "rgba(0, 0, 0, 0.882)", "rgba(0, 0, 0, 0.886)", "rgba(0, 0, 0, 0.89)",
  "rgba(0, 0, 0, 0.894)", "rgba(0, 0, 0, 0.898)", "rgba(0, 0, 0, 0.9)", "rgba(0, 0, 0, 0.906)",
  "rgba(0, 0, 0, 0.91)", "rgba(0, 0, 0, 0.914)", "rgba(0, 0, 0, 0.918)", "rgba(0, 0, 0, 0.92)",
  "rgba(0, 0, 0, 0.925)", "rgba(0, 0, 0, 0.93)", "rgba(0, 0, 0, 0.933)", "rgba(0, 0, 0, 0.937)",
  "rgba(0, 0, 0, 0.94)", "rgba(0, 0, 0, 0.945)", "rgba(0, 0, 0, 0.95)", "rgba(0, 0, 0, 0.953)",
  "rgba(0, 0, 0, 0.957)", "rgba(0, 0, 0, 0.96)", "rgba(0, 0, 0, 0.965)", "rgba(0, 0, 0, 0.97)",
  "rgba(0, 0, 0, 0.973)", "rgba(0, 0, 0, 0.976)", "rgba(0, 0, 0, 0.98)", "rgba(0, 0, 0, 0.984)",
  "rgba(0, 0, 0, 0.99)", "rgba(0, 0, 0, 0.992)", "rgba(0, 0, 0, 0.996)", "#000000",
];

test("canonicalColorString matches native for all 256 alpha bytes", () => {
  assert.equal(NATIVE_ALPHA_TABLE.length, 256);
  for (let byte = 0; byte < 256; byte += 1) {
    const native = NATIVE_ALPHA_TABLE[byte];
    assert.equal(canonicalColorString(0, 0, 0, byte), native, String(byte));
    const parsed = parseSupportedColor(native);
    assert.ok(parsed, native);
    assert.equal(
      Math.round(parsed.color[3] * 255),
      byte,
      `round-trip ${native}`,
    );
  }
});
