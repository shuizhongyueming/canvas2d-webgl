/**
 * Test-only observation of the scene renderer. Structurally identical to the
 * TestHooks protocol in test/types/testing.ts; conformance is pinned by a type
 * assignment in test/cases/gpu/. Never re-exported from the package entry.
 */
export interface SceneTestHooks {
  /** Scene FBO as straight RGBA8 sRGB, top-left row first; alpha=0 => RGB=0. */
  readScene(): {
    width: number;
    height: number;
    pixels: Uint8Array;
    generation: number;
  };
  /** Wait for an already scheduled automatic present; never triggers one. */
  whenPresented(generation: number): Promise<void>;
  resourceCounts(): Readonly<Record<string, number>>;
}

export interface HookSource {
  /** Raw scene readback: premultiplied RGBA8, bottom row first (GL order). */
  readRaw(): {
    width: number;
    height: number;
    pixels: Uint8Array;
    generation: number;
  };
  whenPresented(generation: number): Promise<void>;
  counts(): Record<string, number>;
}

export function createTestHooks(source: HookSource): SceneTestHooks {
  return {
    readScene() {
      const { width, height, pixels, generation } = source.readRaw();
      const stride = width * 4;
      const out = new Uint8Array(width * height * 4);
      const channel = (index: number): number => pixels[index] as number;
      for (let row = 0; row < height; row += 1) {
        const sourceRow = (height - 1 - row) * stride;
        const targetRow = row * stride;
        for (let column = 0; column < stride; column += 4) {
          const alpha = channel(sourceRow + column + 3);
          const offset = targetRow + column;
          if (alpha === 0) {
            out[offset] = 0;
            out[offset + 1] = 0;
            out[offset + 2] = 0;
            out[offset + 3] = 0;
          } else {
            out[offset] = Math.min(
              255,
              Math.round((channel(sourceRow + column) * 255) / alpha),
            );
            out[offset + 1] = Math.min(
              255,
              Math.round((channel(sourceRow + column + 1) * 255) / alpha),
            );
            out[offset + 2] = Math.min(
              255,
              Math.round((channel(sourceRow + column + 2) * 255) / alpha),
            );
            out[offset + 3] = alpha;
          }
        }
      }
      return { width, height, pixels: out, generation };
    },
    whenPresented: (generation) => source.whenPresented(generation),
    resourceCounts: () => source.counts(),
  };
}

const hookRegistry = new WeakMap<object, SceneTestHooks>();

/**
 * Private instance -> hooks association. The public canvas factory registers
 * here at creation; test/harness/bridge.js is the only lookup consumer.
 */
export function registerTestHooks(canvas: object, hooks: SceneTestHooks): void {
  hookRegistry.set(canvas, hooks);
}

export function lookupTestHooks(canvas: object): SceneTestHooks | undefined {
  return hookRegistry.get(canvas);
}
