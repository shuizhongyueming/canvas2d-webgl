import type { CaseDefinition } from "../../types/testing.js";
import { dumpScene } from "../rect/helpers.js";
import { BLUE, makeRenderer, pixelAt, rectDraw } from "../gpu/device-driver.js";

const base = {
  kind: "semantic" as const,
  width: 32,
  height: 32,
  seed: 1,
  fonts: [] as string[],
};

export const cases: CaseDefinition[] = [
  ...(["subpixel", "rotated", "clear", "clip"] as const).map(
    (shape): CaseDefinition => ({
      ...base,
      id: `coverage.${shape}`,
      requirements: ["context.fillRect", "context.clearRect", "context.clip"],
      async run(a) {
        const c = a.context;
        c.fillStyle = "#ff0000";
        if (shape === "clip") {
          c.beginPath();
          c.arc(16, 16, 10.5, 0, Math.PI * 2);
          c.clip();
          c.fillRect(0, 0, 32, 32);
        } else if (shape === "subpixel") c.fillRect(4.5, 4.5, 19, 19);
        else {
          if (shape === "clear") c.fillRect(0, 0, 32, 32);
          c.translate(16, 16);
          c.rotate(Math.PI / 6);
          if (shape === "clear") {
            // None of these drawing states may affect partial clearing.
            c.globalAlpha = 0;
            c.globalCompositeOperation = "lighter";
            c.filter = "brightness(120%)";
            c.clearRect(-9, -9, 18, 18);
          } else c.fillRect(-9, -9, 18, 18);
        }
        const scene = await dumpScene(a);
        const partial = scene.count((p) => p[3] > 0 && p[3] < 255);
        a.assert(partial > 0, `${shape} preserves partial edge coverage`);
        a.observe(`${shape}:partial-coverage`, partial > 0);
      },
    }),
  ),
  ...(["source-over", "source-atop", "source-in", "lighter"] as const).map(
    (mode): CaseDefinition => ({
      ...base,
      id: `clip.soft-composite.${mode}`,
      requirements: [
        "context.clip",
        "context.globalCompositeOperation",
        "ACC-03",
      ],
      async run(a) {
        const c = a.context;
        c.fillStyle = "rgba(192,0,0,0.75)";
        c.fillRect(0, 0, 32, 32);
        const before = (await dumpScene(a)).pixel(0, 4);
        c.beginPath();
        c.rect(0.5, 0, 31.5, 32);
        c.clip();
        c.globalCompositeOperation = mode;
        c.fillStyle = "rgba(192,64,0,0.75)";
        c.fillRect(0, 0, 32, 32);
        const scene = await dumpScene(a);
        const edge = scene.pixel(0, 4);
        const inside = scene.pixel(4, 4);
        a.assert(
          edge[1] > 0 && edge[1] < inside[1],
          "edge keeps partial source contribution",
        );
        if (mode === "source-over")
          a.assert(
            edge[3] > before[3] && edge[3] < inside[3],
            "source-over preserves partial destination",
          );
        if (mode === "source-atop")
          a.assert(
            edge[3] === before[3],
            "source-atop preserves destination alpha",
          );
        if (mode === "source-in")
          a.assert(
            edge[3] > inside[3] && edge[3] < before[3],
            "source-in retains uncovered destination contribution",
          );
        if (mode === "lighter")
          a.assert(
            edge[3] > before[3] && edge[3] < inside[3] && edge[0] < inside[0],
            "lighter preserves partial coverage of the saturated GPU result",
          );
        a.observe("partial-source", edge[1] > 0 && edge[1] < inside[1]);
      },
    }),
  ),
  {
    ...base,
    id: "clip.soft-source-in-snapshot-failure",
    requirements: [
      "context.clip",
      "context.globalCompositeOperation",
      "ACC-03",
    ],
    async run(a) {
      const r = await makeRenderer(4, 4);
      const native = document.createElement("canvas");
      native.width = native.height = 4;
      const ctx = native.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0.5, 0, 3.5, 4);
      const clip = {
        id: 1,
        parent: null,
        path: { id: 1, commands: [] },
        rule: "nonzero" as const,
        mask: () => ({
          kind: "raster" as const,
          canvas: native,
          bounds: { x: 0, y: 0, width: 4, height: 4 },
          pixelWidth: 4,
          pixelHeight: 4,
          alpha: "straight" as const,
          colorSpace: "srgb" as const,
          release() {},
        }),
      };
      const create = r.gl.createTexture,
        copy = r.gl.copyTexImage2D;
      const remove = r.gl.deleteTexture;
      let created = 0,
        deleted = 0;
      r.gl.deleteTexture = (texture) => {
        if (texture) deleted += 1;
        remove.call(r.gl, texture);
      };
      try {
        r.device.draw(
          rectDraw(
            r.device.generation,
            { x: 0, y: 0, width: 4, height: 4 },
            BLUE,
          ),
        );
        for (const failure of ["allocation", "copy"]) {
          let calls = 0;
          r.gl.createTexture = () => {
            calls += 1;
            if (failure === "allocation" && calls === 2)
              return null as unknown as WebGLTexture;
            const texture = create.call(r.gl);
            if (texture) created += 1;
            return texture;
          };
          r.gl.copyTexImage2D = (...args) => {
            if (failure === "copy") r.gl.bindTexture(r.gl.TEXTURE_2D, null);
            copy.apply(r.gl, args);
          };
          let code = "ok";
          try {
            const op = rectDraw(
              r.device.generation,
              { x: 0, y: 0, width: 2, height: 2 },
              BLUE,
              { clip, composite: "source-in" },
            );
            r.device.draw({ ...op, clip });
          } catch (error) {
            code = (error as { code?: string }).code ?? "unknown";
          }
          a.assert(
            code === "initialization-failed",
            `${failure} failure is reported before erasing`,
          );
          a.assert(
            pixelAt(r.hooks.readScene(), 1, 1).join(",") === "0,0,255,255",
            `${failure} failure preserves destination`,
          );
          a.assert(
            r.hooks.resourceCounts().textures === 0,
            `${failure} releases mask lease`,
          );
          a.assert(
            created === deleted,
            `${failure} releases every temporary GL texture`,
          );
        }
        a.observe("snapshot-failure-atomic", true);
      } finally {
        r.gl.createTexture = create;
        r.gl.copyTexImage2D = copy;
        r.gl.deleteTexture = remove;
        r.device.dispose();
      }
    },
  },
  {
    ...base,
    id: "clip.soft-repeated-chain",
    requirements: ["context.clip", "context.save", "context.restore", "ACC-03"],
    async run(a) {
      const c = a.context;
      c.fillStyle = "#ff0000";
      for (const [x, repeats] of [
        [0.5, 1],
        [16.5, 3],
      ] as const) {
        c.save();
        c.beginPath();
        c.rect(x, 4, 8, 16);
        for (let n = 0; n < repeats; n += 1) c.clip();
        c.fillRect(0, 0, 32, 32);
        c.restore();
      }
      const scene = await dumpScene(a);
      const single = scene.pixel(0, 8)[3],
        repeated = scene.pixel(16, 8)[3];
      a.assert(
        single > 0 && single < 255,
        "single clip retains partial coverage",
      );
      a.assert(
        single === repeated,
        "repeated identical clip does not multiply its antialiased edge",
      );
      a.observe("repeated-coverage-equal", single === repeated);
    },
  },
  {
    ...base,
    id: "clip.soft-source-in-outside-and-restore",
    requirements: [
      "context.clip",
      "context.globalCompositeOperation",
      "context.restore",
      "ACC-03",
    ],
    async run(a) {
      const c = a.context;
      c.fillStyle = "#0000ff";
      c.fillRect(0, 0, 32, 32);
      c.save();
      c.beginPath();
      c.rect(4.5, 4, 20, 20);
      c.clip();
      c.globalCompositeOperation = "source-in";
      c.fillStyle = "#ff0000";
      c.fillRect(8, 8, 4, 4);
      const scene = await dumpScene(a);
      a.assert(scene.pixel(0, 8)[3] === 255, "outside clip is preserved");
      a.assert(
        scene.pixel(16, 8)[3] === 0,
        "source-in clears source exterior inside clip",
      );
      a.assert(
        scene.pixel(4, 8)[3] > 0 && scene.pixel(4, 8)[3] < 255,
        "source exterior at soft clip retains partial destination",
      );
      a.assert(
        scene.pixel(9, 9)[0] === 255,
        "source uses original destination alpha",
      );
      c.restore();
      c.fillStyle = "#00ff00";
      c.fillRect(0, 0, 1, 1);
      a.assert(
        (await dumpScene(a)).pixel(0, 0)[1] === 255,
        "restored clip does not leak into later draws",
      );
      a.observe("soft-source-in-domain", true);
    },
  },
];
