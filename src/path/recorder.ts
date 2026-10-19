import type {
  Matrix,
  PathCommand,
  PathSnapshot,
  PathStore,
} from "../internal/contracts.js";

const ARG_COUNT: Readonly<Record<PathCommand["op"], number>> = {
  closePath: 0,
  moveTo: 2,
  lineTo: 2,
  rect: 4,
  quadraticCurveTo: 4,
  arcTo: 5,
  arc: 6,
  ellipse: 8,
};

function allFinite(values: readonly number[]): boolean {
  for (const value of values) if (!Number.isFinite(value)) return false;
  return true;
}

/** Chromium formats the offending radius inside the message; keep the same shape. */
function negativeRadius(
  method: "arc" | "arcTo" | "ellipse",
  axis: "" | "major-axis" | "minor-axis",
  radius: number,
): DOMException {
  const label = axis === "" ? "radius" : `${axis} radius`;
  return new DOMException(
    `Failed to execute '${method}' on 'CanvasRenderingContext2D': ` +
      `The ${label} provided (${radius}) is negative.`,
    "IndexSizeError",
  );
}

function freezeCommand(command: PathCommand): PathCommand {
  return Object.freeze({
    ...command,
    args: Object.freeze([...command.args]),
    transform: Object.freeze([...command.transform]),
  } as PathCommand);
}

/**
 * Records the current path for one compat context. Geometry is fixed by the
 * transform captured at construction time; snapshots are immutable and survive
 * later mutations, begin() and reset().
 */
export class PathRecorder implements PathStore {
  #commands: PathCommand[] = [];
  #id = 1;
  #nextId = 2;

  begin(): void {
    this.#commands = [];
    this.#id = this.#nextId++;
  }

  reset(): void {
    this.begin();
  }

  append(command: PathCommand): void {
    if (
      !Object.prototype.hasOwnProperty.call(ARG_COUNT, command.op) ||
      command.args.length !== ARG_COUNT[command.op]
    )
      throw new TypeError(`Invalid path command: ${String(command.op)}`);
    this.#commands.push(freezeCommand(command));
    this.#id = this.#nextId++;
  }

  snapshot(): PathSnapshot {
    return Object.freeze({
      id: this.#id,
      commands: Object.freeze([...this.#commands]),
    });
  }

  moveTo(x: number, y: number, transform: Matrix): void {
    if (!allFinite([x, y])) return;
    this.append({ op: "moveTo", args: [x, y], transform });
  }

  lineTo(x: number, y: number, transform: Matrix): void {
    if (!allFinite([x, y])) return;
    this.append({ op: "lineTo", args: [x, y], transform });
  }

  closePath(transform: Matrix): void {
    this.append({ op: "closePath", args: [], transform });
  }

  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    transform: Matrix,
  ): void {
    if (!allFinite([x, y, width, height])) return;
    this.append({ op: "rect", args: [x, y, width, height], transform });
  }

  quadraticCurveTo(
    cx: number,
    cy: number,
    x: number,
    y: number,
    transform: Matrix,
  ): void {
    if (!allFinite([cx, cy, x, y])) return;
    this.append({ op: "quadraticCurveTo", args: [cx, cy, x, y], transform });
  }

  arc(
    x: number,
    y: number,
    radius: number,
    start: number,
    end: number,
    anticlockwise: boolean,
    transform: Matrix,
  ): void {
    if (!allFinite([x, y, radius, start, end])) return;
    if (radius < 0) throw negativeRadius("arc", "", radius);
    this.append({
      op: "arc",
      args: [x, y, radius, start, end, anticlockwise],
      transform,
    });
  }

  arcTo(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    radius: number,
    transform: Matrix,
  ): void {
    if (!allFinite([x1, y1, x2, y2, radius])) return;
    if (radius < 0) throw negativeRadius("arcTo", "", radius);
    this.append({ op: "arcTo", args: [x1, y1, x2, y2, radius], transform });
  }

  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    start: number,
    end: number,
    anticlockwise: boolean,
    transform: Matrix,
  ): void {
    if (!allFinite([x, y, radiusX, radiusY, rotation, start, end])) return;
    if (radiusX < 0) throw negativeRadius("ellipse", "major-axis", radiusX);
    if (radiusY < 0) throw negativeRadius("ellipse", "minor-axis", radiusY);
    this.append({
      op: "ellipse",
      args: [x, y, radiusX, radiusY, rotation, start, end, anticlockwise],
      transform,
    });
  }
}
