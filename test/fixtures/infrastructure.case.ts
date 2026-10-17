import type { CaseAdapter, CaseDefinition } from "../types/testing.js";
// Infrastructure only: these cases never satisfy the compatibility catalog.
const base: Omit<CaseDefinition, "id" | "run"> = {
  requirements: ["ACC-02"],
  kind: "combined",
  width: 96,
  height: 64,
  seed: 42,
  fonts: ["16px sans-serif"],
};
function draw(a: CaseAdapter) {
  const c = a.context;
  c.fillStyle = "#3469a0";
  c.fillRect(4, 4, 60, 40);
  c.fillStyle = "rgba(255,120,40,0.5)";
  c.fillRect(24, 16, 48, 36);
  c.font = "16px sans-serif";
  c.fillStyle = "#111";
  c.fillText("Canvas", 5, 60);
  a.assert(a.canvas === c.canvas, "native canvas identity");
  a.observe("width", c.measureText("Canvas").width);
  a.observe("seeded-input", a.random());
}
export const cases: CaseDefinition[] = [
  { ...base, id: "self.native-pair", run: draw },
  { ...base, id: "self.local-difference", run: draw },
  { ...base, id: "self.display-difference", run: draw },
  {
    ...base,
    id: "self.render-error",
    run(a) {
      a.context.fillStyle = "#ff0000";
      a.context.fillRect(8, 8, 12, 10);
      throw Error("injected drawing failure");
    },
  },
  {
    ...base,
    id: "self.skip",
    run(a) {
      a.skip("injected unavailable fixture");
    },
  },
  {
    ...base,
    id: "self.font-unready",
    fonts: ["invalid-font-syntax"],
    run: draw,
  },
];
