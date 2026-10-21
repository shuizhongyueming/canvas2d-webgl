import type { CompositeMode } from "../api.js";
import type {
  ClipSnapshot,
  DrawState,
  Matrix,
  PaintRef,
  StateStore,
} from "../internal/contracts.js";
import { createCompatError, ERROR_CODES } from "../contracts/errors.js";
import { IDENTITY } from "./matrix.js";

/** Native initial drawing state; paint ownership stays with the paint feature. */
export interface StateStoreDefaults {
  readonly fill: PaintRef;
  readonly stroke: PaintRef;
}

interface LogicalState {
  transform: Matrix;
  fill: PaintRef;
  stroke: PaintRef;
  alpha: number;
  composite: CompositeMode;
  filter: "none" | "brightness(120%)";
  lineWidth: number;
  lineCap: "butt" | "round";
  lineJoin: "miter" | "round";
  font: string;
  textAlign: "start" | "left" | "center" | "right";
  textBaseline: "alphabetic" | "top" | "middle" | "bottom";
  clip: ClipSnapshot | null;
}

type StateField = keyof LogicalState;

const FIELDS: readonly StateField[] = [
  "transform",
  "fill",
  "stroke",
  "alpha",
  "composite",
  "filter",
  "lineWidth",
  "lineCap",
  "lineJoin",
  "font",
  "textAlign",
  "textBaseline",
  "clip",
];

function fail(detail: string): never {
  throw createCompatError(ERROR_CODES.CONTRACT, detail);
}

function field(name: string): StateField {
  if (!(FIELDS as readonly string[]).includes(name))
    fail(`unknown state field: ${name}`);
  return name as StateField;
}

function checkValue(key: StateField, value: unknown): void {
  switch (key) {
    case "transform":
      if (
        !Array.isArray(value) ||
        value.length !== 6 ||
        !(value as unknown[]).every(
          (v) => typeof v === "number" && Number.isFinite(v),
        )
      )
        fail("transform must be a six-element finite matrix");
      break;
    case "fill":
    case "stroke":
      if (
        !value ||
        typeof (value as PaintRef).snapshot !== "function" ||
        typeof (value as PaintRef).id !== "number" ||
        typeof (value as PaintRef).version !== "number"
      )
        fail(`${key} must be a PaintRef`);
      break;
    case "alpha":
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1
      )
        fail("alpha must be a finite number in [0,1]");
      break;
    case "composite":
      if (
        value !== "source-over" &&
        value !== "source-atop" &&
        value !== "source-in" &&
        value !== "lighter"
      )
        fail(`unknown composite mode: ${String(value)}`);
      break;
    case "filter":
      if (value !== "none" && value !== "brightness(120%)")
        fail(`unknown filter: ${String(value)}`);
      break;
    case "lineWidth":
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
        fail("lineWidth must be a positive finite number");
      break;
    case "lineCap":
      if (value !== "butt" && value !== "round")
        fail(`unknown lineCap: ${String(value)}`);
      break;
    case "lineJoin":
      if (value !== "miter" && value !== "round")
        fail(`unknown lineJoin: ${String(value)}`);
      break;
    case "font":
      if (typeof value !== "string" || !value) fail("font must be a string");
      break;
    case "textAlign":
      if (
        value !== "start" &&
        value !== "left" &&
        value !== "center" &&
        value !== "right"
      )
        fail(`unknown textAlign: ${String(value)}`);
      break;
    case "textBaseline":
      if (
        value !== "alphabetic" &&
        value !== "top" &&
        value !== "middle" &&
        value !== "bottom"
      )
        fail(`unknown textBaseline: ${String(value)}`);
      break;
    case "clip":
      if (value !== null) {
        const clip = value as ClipSnapshot;
        if (
          !clip ||
          typeof clip !== "object" ||
          typeof clip.id !== "number" ||
          (clip.rule !== "nonzero" && clip.rule !== "evenodd") ||
          !clip.path ||
          typeof clip.path.id !== "number" ||
          !Array.isArray(clip.path.commands)
        )
          fail("clip must be a ClipSnapshot or null");
      }
      break;
  }
}

/**
 * Drawing-state stack with native defaults. save/restore keep PaintRef and
 * ClipSnapshot references; only snapshot() freezes paint versions for a draw.
 */
export function createStateStore(defaults: StateStoreDefaults): StateStore {
  checkValue("fill", defaults.fill);
  checkValue("stroke", defaults.stroke);
  const initial = (): LogicalState => ({
    transform: IDENTITY,
    fill: defaults.fill,
    stroke: defaults.stroke,
    alpha: 1,
    composite: "source-over",
    filter: "none",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    clip: null,
  });
  let current = initial();
  const stack: LogicalState[] = [];
  return {
    save() {
      stack.push({ ...current });
    },
    restore() {
      const restored = stack.pop();
      if (restored) current = restored;
    },
    reset() {
      stack.length = 0;
      current = initial();
    },
    discardClips() {
      current.clip = null;
      for (const saved of stack) saved.clip = null;
    },
    snapshot(): DrawState {
      return Object.freeze({
        transform: Object.freeze([...current.transform]) as Matrix,
        fill: current.fill.snapshot(),
        stroke: current.stroke.snapshot(),
        alpha: current.alpha,
        composite: current.composite,
        filter: current.filter,
        lineWidth: current.lineWidth,
        lineCap: current.lineCap,
        lineJoin: current.lineJoin,
        font: current.font,
        textAlign: current.textAlign,
        textBaseline: current.textBaseline,
        clip: current.clip,
      });
    },
    set(name: string, value: unknown): void {
      const key = field(name);
      checkValue(key, value);
      if (key === "transform")
        current.transform = Object.freeze([
          ...(value as unknown as readonly number[]),
        ]) as Matrix;
      else (current as unknown as Record<StateField, unknown>)[key] = value;
    },
    get(name: string): unknown {
      return current[field(name)];
    },
  };
}
