import type { CaseDefinition } from "../../types/testing.js";

const base = {
  kind: "semantic" as const,
  width: 8,
  height: 8,
  seed: 1,
  fonts: [] as string[],
};

const PROBE_EVENT = "canvas2dwebgl-probe";

export const cases: CaseDefinition[] = [
  {
    ...base,
    id: "canvas.style.contract",
    requirements: ["canvas.style"],
    run(a) {
      const style = a.canvas.style;
      a.assert(!!style && typeof style === "object", "style is exposed");
      a.assert(style === a.canvas.style, "style identity is stable");
      style.setProperty("--c2w-probe", "7");
      a.assert(
        a.canvas.style.getPropertyValue("--c2w-probe") === "7",
        "style writes reach the computed declaration",
      );
      a.observe("customProperty", a.canvas.style.getPropertyValue("--c2w-probe"));
      a.observe("identityStable", style === a.canvas.style);
    },
  },
  {
    ...base,
    id: "canvas.addEventListener.contract",
    requirements: ["canvas.addEventListener"],
    run(a) {
      let fired = 0;
      let observedType = "";
      let thisIsCurrentTarget = false;
      const listener = (event: Event) => {
        fired += 1;
        observedType = event.type;
        thisIsCurrentTarget = event.currentTarget === event.target;
      };
      a.canvas.addEventListener(PROBE_EVENT, listener);
      a.canvas.dispatchEvent(new Event(PROBE_EVENT));
      a.canvas.removeEventListener(PROBE_EVENT, listener);
      a.assert(fired === 1, "a registered listener fires exactly once");
      a.assert(observedType === PROBE_EVENT, "the event type matches");
      a.assert(thisIsCurrentTarget, "the listener runs on the real event target");
      a.observe("fired", fired);
      a.observe("type", observedType);
    },
  },
  {
    ...base,
    id: "canvas.removeEventListener.contract",
    requirements: ["canvas.removeEventListener"],
    run(a) {
      let fired = 0;
      const listener = () => {
        fired += 1;
      };
      a.canvas.addEventListener(PROBE_EVENT, listener);
      a.canvas.removeEventListener(PROBE_EVENT, listener);
      a.canvas.dispatchEvent(new Event(PROBE_EVENT));
      a.assert(fired === 0, "a removed listener never fires");
      a.observe("fired", fired);
    },
  },
  {
    ...base,
    id: "canvas.dispatchEvent.contract",
    requirements: ["canvas.dispatchEvent"],
    run(a) {
      let fired = 0;
      const listener = (event: Event) => {
        fired += 1;
        a.assert(
          event.currentTarget === event.target,
          "dispatch runs on the real target",
        );
      };
      a.canvas.addEventListener(PROBE_EVENT, listener);
      const delivered = a.canvas.dispatchEvent(new Event(PROBE_EVENT));
      a.canvas.removeEventListener(PROBE_EVENT, listener);
      a.assert(fired === 1, "the dispatched event reached the listener");
      a.assert(delivered === true, "an uncancelled event reports delivery");
      a.observe("delivered", delivered);
      a.observe("fired", fired);
    },
  },
  {
    ...base,
    id: "canvas.getBoundingClientRect.contract",
    requirements: ["canvas.getBoundingClientRect"],
    run(a) {
      const rect = a.canvas.getBoundingClientRect();
      a.assert(rect.width === 8 && rect.height === 8, "layout size is real");
      a.observe("size", [rect.width, rect.height]);
      a.observe(
        "methodIdentityStable",
        a.canvas.getBoundingClientRect === a.canvas.getBoundingClientRect,
      );
    },
  },
  {
    ...base,
    id: "canvas.passthrough.property-writes",
    requirements: ["CAN-03"],
    run(a) {
      const canvas = a.canvas as unknown as Record<string, unknown> & {
        id: string;
        className: string;
      };
      canvas.id = "c2w-proxy";
      canvas.className = "c2w-class";
      canvas.expando = 42;
      a.assert(
        canvas.id === "c2w-proxy" &&
          canvas.className === "c2w-class" &&
          canvas.expando === 42,
        "plain property writes land on the real target",
      );
      a.observe("reads", [canvas.id, canvas.className, canvas.expando]);
      delete canvas.expando;
      a.assert(!("expando" in canvas), "property deletion passes through");
      a.observe("deleted", !("expando" in canvas));
    },
  },
];
