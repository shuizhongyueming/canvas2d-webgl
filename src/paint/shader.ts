/**
 * NPOT-safe repeat-pattern tiling for the WebGL 1 backend.
 *
 * WebGL 1 forbids REPEAT/MIRRORED_REPEAT wrap modes on non-power-of-two
 * textures, so pattern tiling lives in the fragment shader via fract() and
 * the texture unit must keep CLAMP_TO_EDGE on both axes. The pattern space is
 * the draw-time user space (matching native phase behavior under transforms);
 * uv = userSpacePosition / tileSize, then fract(uv) keeps tiling correct for
 * negative coordinates after rotations/reflections.
 *
 * Note for consumers: with LINEAR filtering, fract() wrap seams can blend
 * against clamped edge texels. Pixel-level acceptance of pattern edges is
 * reviewed in the consumer tickets (path/rect), not here.
 */
export const REPEAT_PATTERN_WRAP_S = 0x812f; // CLAMP_TO_EDGE; never REPEAT (0x2901)
export const REPEAT_PATTERN_WRAP_T = 0x812f;

export const REPEAT_PATTERN_GLSL = `
// Tile a repeat-pattern texture. patternUv is the fragment position in
// pattern (draw-time user) space divided by the tile size, so it may be
// negative or exceed 1.0. fract() matches Canvas "repeat" tiling for
// negative coordinates and keeps NPOT textures legal in WebGL 1.
vec4 canvas2dRepeatPattern(sampler2D tile, vec2 patternUv) {
  return texture2D(tile, fract(patternUv));
}
`;

/** JavaScript reference for the shader's fract() tiling (GLSL semantics). */
export function repeatUv(u: number, v: number): readonly [number, number] {
  return [u - Math.floor(u), v - Math.floor(v)];
}
