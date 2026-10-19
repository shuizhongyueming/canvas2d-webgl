import type { Color } from "../internal/contracts.js";

/**
 * Supported style strings (support matrix values "hex" and "rgba"):
 * #rgb, #rgba, #rrggbb, #rrggbbaa and legacy comma rgb()/rgba().
 * Channels quantize to 8-bit with round-half-up, matching native behavior
 * (Chromium probe evidence recorded on issue #15).
 */
export interface ParsedPaintColor {
  readonly color: Color;
  readonly canonical: string;
}

const NUM = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`;
const PCT = String.raw`(?:${NUM}%)`;
const ALPHA = String.raw`(?:${NUM}|${PCT})`;
const WS0 = String.raw`\s*`;
const WS1 = String.raw`\s+`;

const LEGACY_RGB_NUMERIC = new RegExp(
  String.raw`^rgba?\(${WS0}(${NUM})${WS0},${WS0}(${NUM})${WS0},${WS0}(${NUM})${WS0}(?:,${WS0}(${ALPHA})${WS0})?\)$`,
);
const LEGACY_RGB_PERCENT = new RegExp(
  String.raw`^rgba?\(${WS0}(${PCT})${WS0},${WS0}(${PCT})${WS0},${WS0}(${PCT})${WS0}(?:,${WS0}(${ALPHA})${WS0})?\)$`,
);
const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/;

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}
function channelNumber(token: string): number {
  return clampByte(Number(token));
}
function channelPercent(token: string): number {
  return clampByte((Number(token.slice(0, -1)) * 255) / 100);
}
function alphaByte(token: string | undefined): number {
  if (token === undefined) return 255;
  const percent = token.endsWith("%");
  const raw = Number(percent ? token.slice(0, -1) : token);
  const value = Math.min(1, Math.max(0, percent ? raw / 100 : raw));
  return clampByte(value * 255);
}

const HEX_DIGITS = "0123456789abcdef";
function hexByte(byte: number): string {
  return HEX_DIGITS[(byte >> 4) & 15]! + HEX_DIGITS[byte & 15]!;
}

/**
 * Shortest decimal that round-trips to the stored 8-bit alpha, matching the
 * native getter serialization (e.g. 0xdd -> "0.867", 0.5 -> "0.5").
 */
export function formatAlpha(alphaByteValue: number): string {
  if (alphaByteValue === 0) return "0";
  const value = alphaByteValue / 255;
  for (let precision = 1; precision <= 17; precision += 1) {
    let candidate = value.toFixed(precision);
    if (candidate.includes(".")) {
      candidate = candidate.replace(/0+$/, "").replace(/\.$/, "");
    }
    if (Math.round(Number(candidate) * 255) === alphaByteValue) {
      return candidate;
    }
  }
  return String(value);
}

export function canonicalColorString(
  r: number,
  g: number,
  b: number,
  a: number,
): string {
  if (a === 255) return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
  return `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})`;
}

function parsed(r: number, g: number, b: number, a: number): ParsedPaintColor {
  return {
    color: Object.freeze([r / 255, g / 255, b / 255, a / 255]) as Color,
    canonical: canonicalColorString(r, g, b, a),
  };
}

function parseHexColor(s: string): ParsedPaintColor | null {
  const match = HEX.exec(s);
  const digits = match?.[1];
  if (!digits) return null;
  const step = digits.length <= 4 ? 1 : 2;
  const read = (index: number): number => {
    const part =
      step === 1 ? digits[index]! + digits[index]! : digits.slice(index, index + 2);
    return parseInt(part, 16);
  };
  const r = read(0);
  const g = read(step);
  const b = read(step * 2);
  const a = digits.length % 4 === 0 ? read(step * 3) : 255;
  return parsed(r, g, b, a);
}

export function parseSupportedColor(input: string): ParsedPaintColor | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const hex = parseHexColor(s);
  if (hex) return hex;
  let match = LEGACY_RGB_NUMERIC.exec(s);
  if (match) {
    return parsed(
      channelNumber(match[1]!),
      channelNumber(match[2]!),
      channelNumber(match[3]!),
      alphaByte(match[4]),
    );
  }
  match = LEGACY_RGB_PERCENT.exec(s);
  if (match) {
    return parsed(
      channelPercent(match[1]!),
      channelPercent(match[2]!),
      channelPercent(match[3]!),
      alphaByte(match[4]),
    );
  }
  return null;
}

const NAMED_COLORS: ReadonlySet<string> = new Set([
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige",
  "bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown",
  "burlywood", "cadetblue", "chartreuse", "chocolate", "coral",
  "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan",
  "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki",
  "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred",
  "darksalmon", "darkseagreen", "darkslateblue", "darkslategray",
  "darkslategrey", "darkturquoise", "darkviolet", "deeppink", "deepskyblue",
  "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite",
  "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod",
  "gray", "green", "greenyellow", "grey", "honeydew", "hotpink", "indianred",
  "indigo", "ivory", "khaki", "lavender", "lavenderblush", "lawngreen",
  "lemonchiffon", "lightblue", "lightcoral", "lightcyan",
  "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink",
  "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray",
  "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen",
  "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue",
  "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue",
  "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue",
  "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", "oldlace",
  "olive", "olivedrab", "orange", "orangered", "orchid", "palegoldenrod",
  "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff",
  "peru", "pink", "plum", "powderblue", "purple", "rebeccapurple", "red",
  "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen",
  "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray",
  "slategrey", "snow", "springgreen", "steelblue", "tan", "teal", "thistle",
  "tomato", "transparent", "turquoise", "violet", "wheat", "white",
  "whitesmoke", "yellow", "yellowgreen",
]);

// Valid CSS colors outside the supported set. These recognizers only decide
// between "unsupported-api" (legal but out of scope) and native ignore
// (invalid); they never convert colors.
const HUE = String.raw`(?:${NUM}(?:deg|grad|rad|turn)?)`;
const MODERN_COMPONENT = String.raw`(?:${NUM}|${PCT}|none)`;
const MODERN_PERCENT = String.raw`(?:${PCT}|none)`;
const MODERN_HUE = String.raw`(?:${NUM}(?:deg|grad|rad|turn)?|${PCT}|none)`;
const UNSUPPORTED_FUNCTIONAL: readonly RegExp[] = [
  // Modern space-separated rgb()/rgba() with optional slash alpha.
  new RegExp(
    String.raw`^rgba?\(${WS0}${MODERN_COMPONENT}${WS1}${MODERN_COMPONENT}${WS1}${MODERN_COMPONENT}(?:${WS0}\/${WS0}${MODERN_COMPONENT})?${WS0}\)$`,
  ),
  // Legacy comma hsl()/hsla().
  new RegExp(
    String.raw`^hsla?\(${WS0}${HUE}${WS0},${WS0}${PCT}${WS0},${WS0}${PCT}(?:${WS0},${WS0}${ALPHA})?${WS0}\)$`,
  ),
  // Modern hsl()/hsla().
  new RegExp(
    String.raw`^hsla?\(${WS0}${MODERN_HUE}${WS1}${MODERN_PERCENT}${WS1}${MODERN_PERCENT}(?:${WS0}\/${WS0}${MODERN_COMPONENT})?${WS0}\)$`,
  ),
  // hwb() (modern syntax only).
  new RegExp(
    String.raw`^hwb\(${WS0}${MODERN_HUE}${WS1}${MODERN_PERCENT}${WS1}${MODERN_PERCENT}(?:${WS0}\/${WS0}${MODERN_COMPONENT})?${WS0}\)$`,
  ),
  // lab(), lch(), oklab(), oklch().
  new RegExp(
    String.raw`^(?:lab|oklab)\(${WS0}${MODERN_COMPONENT}${WS1}${MODERN_COMPONENT}${WS1}${MODERN_COMPONENT}(?:${WS0}\/${WS0}${MODERN_COMPONENT})?${WS0}\)$`,
  ),
  new RegExp(
    String.raw`^(?:lch|oklch)\(${WS0}${MODERN_COMPONENT}${WS1}${MODERN_COMPONENT}${WS1}${MODERN_HUE}(?:${WS0}\/${WS0}${MODERN_COMPONENT})?${WS0}\)$`,
  ),
  // color() with a predefined color space.
  new RegExp(
    String.raw`^color\(${WS0}(?:srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz|xyz-d50|xyz-d65)(?:${WS1}${MODERN_COMPONENT}){3}(?:${WS0}\/${WS0}${MODERN_COMPONENT})?${WS0}\)$`,
  ),
];

export type ColorValueClass = "supported" | "unsupported" | "invalid";
/**
 * "supported": parsed by parseSupportedColor. "unsupported": legal CSS color
 * outside the support matrix; callers must report unsupported-api. "invalid":
 * callers keep native semantics (fillStyle ignores, addColorStop throws).
 */
export function classifyColorValue(input: string): ColorValueClass {
  const s = input.trim().toLowerCase();
  if (!s) return "invalid";
  if (parseSupportedColor(input) !== null) return "supported";
  if (NAMED_COLORS.has(s)) return "unsupported";
  if (UNSUPPORTED_FUNCTIONAL.some((pattern) => pattern.test(s))) {
    return "unsupported";
  }
  return "invalid";
}
