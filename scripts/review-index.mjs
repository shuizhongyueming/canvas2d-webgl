import { diffPixels } from "../test/live/measure/node.mjs";

/**
 * Review-packet measurements over a collected reference/actual pair. Pure
 * helpers: they describe a difference for a human reviewer and never decide
 * acceptance or calibrate a tolerance.
 */

/** Per-pair statistics: changed pixels plus the shape of the difference. */
export function measurePair(reference, actual) {
  const difference = diffPixels(reference, actual);
  let edgeFlips = 0;
  let lowAlphaDeltas = 0;
  for (let i = 0; i < reference.data.length; i += 4) {
    const alpha = reference.data[i + 3];
    const actualAlpha = actual.data[i + 3];
    let delta = 0;
    for (let channel = 0; channel < 4; channel += 1)
      delta = Math.max(
        delta,
        Math.abs(actual.data[i + channel] - reference.data[i + channel]),
      );
    if (delta === 0) continue;
    // A hard coverage edge against a soft one, or a fully transparent pixel
    // turning opaque: not a rounding difference.
    if (alpha === 0 || actualAlpha === 0) edgeFlips += 1;
    else if (alpha === actualAlpha && alpha < 32) lowAlphaDeltas += 1;
  }
  return {
    changed: difference.changedPixels,
    bounds: difference.bounds,
    maxDelta: difference.maxChannelDelta,
    edgeFlips,
    lowAlphaDeltas,
  };
}

/**
 * Copy `actual` and shift the first channel of every point by one unit, then
 * locate the differences. The locator must report exactly the injected points;
 * otherwise it is hiding local errors behind an aggregate.
 */
export function isolatedInjection(reference, actual, points) {
  const mutated = {
    width: actual.width,
    height: actual.height,
    data: Buffer.from(actual.data),
  };
  const injected = [];
  for (const [x, y] of points) {
    if (x < 0 || y < 0 || x >= actual.width || y >= actual.height) continue;
    const offset = (y * actual.width + x) * 4;
    mutated.data[offset] =
      mutated.data[offset] === 255 ? 254 : mutated.data[offset] + 1;
    injected.push([x, y]);
  }
  const diff = diffPixels(reference, mutated);
  const located = [];
  for (let i = 0; i < diff.data.length; i += 4)
    // The difference image marks any changed pixel purple.
    if (
      diff.data[i] === 255 &&
      diff.data[i + 1] === 0 &&
      diff.data[i + 2] === 180
    )
      located.push([(i / 4) % diff.width, Math.floor(i / 4 / diff.width)]);
  const order = (a, b) => a[1] - b[1] || a[0] - b[0];
  const expected = [...injected].sort(order);
  const reported = [...located].sort(order);
  return {
    injected: injected.length,
    reported: diff.changedPixels,
    located: reported,
    expected,
    exact:
      diff.changedPixels === injected.length &&
      JSON.stringify(reported) === JSON.stringify(expected),
  };
}

/** Fixed injection points for a WxH pair: top-left, centre, near bottom-right. */
export function injectionPoints(width, height) {
  return [
    [3, 3],
    [Math.floor(width / 2), Math.floor(height / 2)],
    [width - 2, height - 3],
  ].filter(([x, y]) => x >= 0 && y >= 0 && x < width && y < height);
}
