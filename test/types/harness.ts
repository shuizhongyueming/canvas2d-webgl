import type { CaseDefinition } from "./testing.js";
const definition: CaseDefinition = {
  id: "example",
  requirements: ["CAN-02"],
  kind: "combined",
  seed: 1,
  width: 32,
  height: 32,
  fonts: [],
  async run(a) {
    a.context.fillStyle = "#123456";
    a.context.fillRect(0, 0, 20, 20);
    a.observe("alpha", a.context.globalAlpha);
    a.assert(a.context.canvas === a.canvas);
    a.observe("random", a.random());
    await a.checkpoint();
    // @ts-expect-error Native-only readback is not available on both adapter branches.
    a.context.getImageData(0, 0, 1, 1);
  },
};
void definition;
