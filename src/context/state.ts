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
  if (key === "transform") {
    if (
      !Array.isArray(value) ||
      value.length !== 6 ||
      !(value as unknown[]).every((v) => typeof v === "number")
    )
      fail("transform must be a six-element numeric matrix");
  } else if (key === "fill" || key === "stroke") {
    if (
      !value ||
      typeof (value as PaintRef).snapshot !== "function" ||
      typeof (value as PaintRef).id !== "number" ||
      typeof (value as PaintRef).version !== "number"
    )
      fail(`${key} must be a PaintRef`);
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
      else
        (current as unknown as Record<StateField, unknown>)[key] = value;
    },
    get(name: string): unknown {
      return current[field(name)];
    },
  };
}
