import type { CaseDefinition } from "../../types/testing.js";

const base = {
  kind: "semantic" as const,
  width: 8,
  height: 8,
  seed: 1,
  fonts: [] as string[],
};

export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "canvas.width.contract",
    requirements: ["canvas.width"],
    run(a) {
      a.assert(a.canvas.width === 8, "width reflects the target size");
      a.canvas.width = 12;
      a.assert(a.canvas.width === 12, "width assignment round-trips");
      a.observe("width", a.canvas.width);
    },
  },
  {
    ...base,
    id: "canvas.height.contract",
    requirements: ["canvas.height"],
    run(a) {
      a.assert(a.canvas.height === 8, "height reflects the target size");
      a.canvas.height = 11;
      a.assert(a.canvas.height === 11, "height assignment round-trips");
      a.observe("height", a.canvas.height);
    },
  },
  {
    ...base,
    id: "canvas.size.coercion",
    requirements: ["canvas.width", "canvas.height"],
    run(a) {
      const loose = a.canvas as unknown as {
        width: unknown;
        height: unknown;
      };
      loose.width = "15";
      const fromString = a.canvas.width;
      loose.width = 7.9;
      const fromFloat = a.canvas.width;
      loose.height = true;
      const fromBoolean = a.canvas.height;
      a.assert(
        fromString === 15 && fromFloat === 7 && fromBoolean === 1,
        "dimensions follow WebIDL unsigned long coercion",
      );
      a.observe("coerced", [fromString, fromFloat, fromBoolean]);
    },
  },
  {
    ...base,
    id: "canvas.resize.state-reset",
    requirements: ["canvas.width", "canvas.height", "CAN-04"],
    run(a) {
      const context = a.context;
      const read = () => [
        context.globalAlpha,
        context.lineCap,
        String(context.fillStyle),
      ];
      context.globalAlpha = 0.5;
      context.lineCap = "round";
      context.fillStyle = "#ff0000";
      const before = read();
      a.canvas.width = 8; // Assigning the same value still resets (CAN-04).
      const afterSameSize = read();
      a.assert(
        afterSameSize[0] === 1 &&
          afterSameSize[1] === "butt" &&
          afterSameSize[2] === "#000000",
        "same-size assignment resets the drawing state",
      );
      context.globalAlpha = 0.25;
      a.canvas.width = 10;
      a.canvas.height = 9;
      const afterResize = read();
      a.assert(
        afterResize[0] === 1 &&
          afterResize[1] === "butt" &&
          afterResize[2] === "#000000",
        "resize resets the drawing state",
      );
      a.observe("before", before);
      a.observe("afterSameSize", afterSameSize);
      a.observe("afterResize", afterResize);
      a.observe("size", [a.canvas.width, a.canvas.height]);
      const canvas = a.canvas as unknown as { getContext(t: string): unknown };
      a.assert(
        canvas.getContext("2d") === context,
        "context identity survives resize",
      );
      a.observe("contextStable", canvas.getContext("2d") === context);
    },
  },
];
