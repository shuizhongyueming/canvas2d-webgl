import type { CaseDefinition } from "../../types/testing.js";
import { TRANSPARENT, dumpScene, pixelsEqual } from "./helpers.js";

const renderBase = {
  kind: "render" as const,
  width: 64,
  height: 64,
  seed: 1,
  fonts: [] as string[],
};

/**
 * stroke() rendering through the approved stroke asset service: the native
 * rasterizer interprets the stroke state (width, cap, join) in the draw-time
 * transform, while the geometry stays construction-baked. Defaults are the
 * native miter/butt; only the supported setters are exercised.
 */
export const cases: CaseDefinition[] = [
  {
    ...renderBase,
    id: "context.stroke.render",
    requirements: ["context.stroke", "context.beginPath", "context.moveTo", "context.lineTo", "context.lineWidth"],
    run(a) {
      const context = a.context;
      context.lineWidth = 2;
      context.strokeStyle = "#ff0000";
      context.beginPath();
      context.moveTo(6, 6);
      context.lineTo(58, 6);
      context.stroke();
      context.lineWidth = 6;
      context.strokeStyle = "#0000ff";
      context.beginPath();
      context.moveTo(6, 20);
      context.lineTo(32, 44);
      context.lineTo(58, 20);
      context.stroke();
    },
  },
  {
    ...renderBase,
    id: "path.stroke.nonuniform-scale",
    requirements: ["context.stroke", "context.moveTo", "context.lineTo", "context.scale", "context.setTransform", "context.lineWidth"],
    run(a) {
      const context = a.context;
      // The stroke width scales with the draw-time transform, anisotropically:
      // horizontal segments thicken by scaleY, vertical ones by scaleX.
      context.scale(3, 1);
      context.lineWidth = 4;
      context.strokeStyle = "#ff0000";
      context.beginPath();
      context.moveTo(4, 8);
      context.lineTo(18, 8);
      context.moveTo(8, 12);
      context.lineTo(8, 32);
      context.stroke();
      context.setTransform(1, 3, 0, 1, 0, 0);
      context.strokeStyle = "#0000ff";
      context.beginPath();
      context.moveTo(24, 8);
      context.lineTo(24, 18);
      context.moveTo(28, 12);
      context.lineTo(56, 12);
      context.stroke();
      context.setTransform(1, 0, 0, 1, 0, 0);
      // Same path built under scale, stroked under identity: the geometry is
      // construction-baked but the width follows the draw-time identity.
      context.scale(2, 2);
      context.beginPath();
      context.moveTo(20, 20);
      context.lineTo(28, 20);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.lineWidth = 2;
      context.strokeStyle = "#00ff00";
      context.stroke();
    },
  },
  {
    ...renderBase,
    id: "path.stroke.linejoin-linecap",
    requirements: ["context.stroke", "context.lineJoin", "context.lineCap", "context.lineWidth", "context.moveTo", "context.lineTo", "context.arc"],
    run(a) {
      const context = a.context;
      context.lineWidth = 8;
      context.strokeStyle = "#ff0000";
      // Native defaults: miter join, butt cap — a sharp corner, flat ends.
      context.beginPath();
      context.moveTo(8, 24);
      context.lineTo(16, 8);
      context.lineTo(24, 24);
      context.stroke();
      // The supported setters: round join and round cap.
      context.lineJoin = "round";
      context.lineCap = "round";
      context.strokeStyle = "#0000ff";
      context.beginPath();
      context.moveTo(36, 24);
      context.lineTo(44, 8);
      context.lineTo(52, 24);
      context.stroke();
      // Round caps on a dashed-free arc pair.
      context.lineWidth = 6;
      context.strokeStyle = "#00ff00";
      context.beginPath();
      context.arc(20, 46, 10, Math.PI * 0.2, Math.PI * 1.4);
      context.stroke();
      context.lineCap = "butt";
      context.strokeStyle = "#ff00ff";
      context.beginPath();
      context.arc(46, 46, 10, Math.PI * 0.2, Math.PI * 1.4);
      context.stroke();
    },
  },
  {
    ...renderBase,
    id: "path.stroke.degenerate-caps",
    requirements: ["context.stroke", "context.moveTo", "context.lineTo", "context.closePath", "context.lineCap", "context.lineWidth"],
    run(a) {
      const context = a.context;
      context.lineWidth = 6;
      // A zero-length subpath paints a dot only under round caps.
      context.lineCap = "round";
      context.strokeStyle = "#ff0000";
      context.beginPath();
      context.moveTo(16, 16);
      context.lineTo(16, 16);
      context.stroke();
      context.lineCap = "butt";
      context.strokeStyle = "#0000ff";
      context.beginPath();
      context.moveTo(48, 16);
      context.lineTo(48, 16);
      context.stroke();
      // An empty closePath-only path strokes nothing either way.
      context.lineCap = "round";
      context.strokeStyle = "#00ff00";
      context.beginPath();
      context.moveTo(48, 48);
      context.closePath();
      context.stroke();
    },
  },
  {
    ...renderBase,
    id: "path.stroke.construction-transform",
    requirements: ["context.stroke", "context.rect", "context.translate", "context.rotate", "context.setTransform", "context.save", "context.restore", "context.lineWidth"],
    run(a) {
      const context = a.context;
      // Built under rotation, stroked under identity: geometry keeps the
      // construction transform, the stroke width does not.
      context.save();
      context.translate(32, 32);
      context.rotate(Math.PI / 6);
      context.rect(-12, -12, 24, 24);
      context.restore();
      context.lineWidth = 3;
      context.strokeStyle = "#ff0000";
      context.stroke();
      // The reverse: built under identity, stroked under translation — the
      // square stays put and only the (translation-invariant) width applies.
      context.beginPath();
      context.rect(44, 44, 12, 12);
      context.setTransform(1, 0, 0, 1, -30, -20);
      context.lineWidth = 5;
      context.strokeStyle = "#0000ff";
      context.stroke();
      context.setTransform(1, 0, 0, 1, 0, 0);
    },
  },
  {
    ...renderBase,
    id: "path.stroke.zero-width-line",
    requirements: ["context.stroke", "context.rect", "context.lineWidth"],
    kind: "combined",
    async run(a) {
      const context = a.context;
      // A recorded rect with one zero extent strokes its line, like strokeRect.
      context.lineWidth = 2;
      context.strokeStyle = "#ff0000";
      context.beginPath();
      context.rect(8, 16, 32, 0);
      context.stroke();
      const scene = await dumpScene(a);
      a.assert(
        pixelsEqual(scene.pixel(20, 15), [255, 0, 0, 255]) &&
          pixelsEqual(scene.pixel(20, 16), [255, 0, 0, 255]),
        "a zero-height recorded rect strokes a horizontal line",
      );
      a.assert(
        pixelsEqual(scene.pixel(20, 12), TRANSPARENT),
        "nothing above the line",
      );
      a.observe("zeroExtentStroked", true);
    },
  },
];
