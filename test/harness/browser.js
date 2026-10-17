import { createCompatCanvas } from "../../src/index.js";
import { hooksFor } from "./bridge.js";
export function blocked(message) {
  return Object.assign(new Error(message), { code: "harness-blocked" });
}
export async function bounded(promise, ms, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(blocked(message)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function waitFonts(
  fonts,
  fontSet = document.fonts,
  timeout = 5000,
) {
  try {
    await bounded(
      Promise.all(fonts.map((font) => fontSet.load(font))),
      timeout,
      "font-timeout",
    );
    await bounded(fontSet.ready, timeout, "font-timeout");
    if (fonts.some((font) => !fontSet.check(font)))
      throw blocked("font-unavailable");
  } catch (e) {
    throw blocked(`font-not-ready: ${e.message}`);
  }
}
export function probeGPU() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    stencil: true,
    preserveDrawingBuffer: false,
  });
  if (!gl) throw blocked("webgl-unavailable");
  try {
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = String(
      gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
    );
    const attributes = gl.getContextAttributes();
    if (!attributes?.stencil) throw blocked("stencil-unavailable");
    return {
      gpu,
      attributes,
      version: gl.getParameter(gl.VERSION),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    };
  } finally {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
// Reject JSON's lossy conversions (NaN/Infinity/-0/undefined and custom objects).
export function observationValue(value) {
  const visit = (v) => {
    if (v === null || typeof v === "string" || typeof v === "boolean") return;
    if (typeof v === "number" && Number.isFinite(v) && !Object.is(v, -0))
      return;
    if (Array.isArray(v)) {
      for (const item of v) visit(item);
      return;
    }
    if (
      typeof v === "object" &&
      Object.getPrototypeOf(v) === Object.prototype
    ) {
      for (const item of Object.values(v)) visit(item);
      return;
    }
    throw Error(
      "Observation must be lossless JSON; encode exceptional values explicitly",
    );
  };
  visit(value);
  return JSON.parse(JSON.stringify(value));
}
function sampleScene(target, context, hooks) {
  const image = hooks
    ? hooks.readScene()
    : context.getImageData(0, 0, target.width, target.height);
  const pixels = hooks ? image.pixels : image.data;
  if (
    !(image.width > 0 && image.height > 0) ||
    pixels.length !== image.width * image.height * 4
  )
    throw Error("Invalid scene sample");
  return {
    width: image.width,
    height: image.height,
    generation: image.generation ?? 0,
    pixels: Array.from(pixels),
  };
}
export async function execute({ module, id, mode, timeout = 10000 }) {
  let compat, target, context, hooks, definition;
  const observations = {},
    checks = [];
  try {
    const { cases } = await import(module);
    definition = cases.find((c) => c.id === id);
    if (!definition) throw Error(`Case not found: ${id}`);
    await waitFonts(definition.fonts, document.fonts, timeout);
    // Each invocation lives in a fresh page; both adapters receive the same PRNG.
    let seed = definition.seed >>> 0;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    Math.random = random;
    target = document.createElement("canvas");
    target.id = "target";
    target.width = definition.width;
    target.height = definition.height;
    target.style.cssText = "display:block;";
    document.body.append(target);
    let canvas;
    if (mode === "native") {
      canvas = target;
      context = target.getContext("2d");
    } else {
      compat = createCompatCanvas(target);
      canvas = compat;
      context = compat.getContext("2d");
      if (!target.getContext("webgl"))
        throw Error("Compatibility target is not bound to WebGL 1");
      hooks = hooksFor(compat);
    }
    if (!context) throw blocked("2d-unavailable");
    const adapter = {
      canvas,
      context,
      random,
      assert(value, message = "assertion failed") {
        checks.push({ message, pass: !!value });
        if (!value) throw Error(message);
      },
      observe(key, value) {
        if (key in observations) throw Error(`Duplicate observation: ${key}`);
        observations[key] = observationValue(value);
      },
      skip(reason) {
        throw blocked(`skip: ${reason}`);
      },
      async checkpoint() {
        if (hooks) {
          const { generation } = hooks.readScene();
          await bounded(
            hooks.whenPresented(generation),
            timeout,
            "present-timeout",
          );
        }
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      },
    };
    await bounded(
      Promise.resolve().then(() => definition.run(adapter)),
      timeout,
      "case-timeout",
    );
    await adapter.checkpoint();
    if (
      definition.kind !== "render" &&
      checks.length === 0 &&
      Object.keys(observations).length === 0
    )
      throw Error("Semantic case supplied no assertions or observations");
    const scene =
      definition.kind !== "semantic"
        ? sampleScene(target, context, hooks)
        : undefined;
    // Kept alive until the driver takes a compositor screenshot. No public readback.
    return {
      execution: "executed",
      semantic: definition.kind === "render" ? "not-applicable" : "pass",
      observations,
      checks,
      scene,
      fonts: definition.fonts.map((font) => ({
        font,
        ready: document.fonts.check(font),
      })),
    };
  } catch (e) {
    let scene;
    // Keep partial failure evidence when a drawing context exists. Initialization
    // and missing-font failures legitimately have no sample; preserve the error.
    if (
      context &&
      definition?.kind !== "semantic" &&
      (mode === "native" || hooks)
    ) {
      try {
        scene = sampleScene(target, context, hooks);
      } catch {
        /* original error wins */
      }
    }
    const unavailable = [
      "harness-blocked",
      "not-implemented",
      "test-hooks-unavailable",
      "webgl-unavailable",
      "capability-unavailable",
    ].includes(e?.code);
    return {
      execution: unavailable ? "blocked" : "executed",
      semantic: unavailable ? "not-applicable" : "fail",
      error: String(e?.stack || e),
      code: e?.code,
      scene,
      observations,
      checks,
    };
  }
}
