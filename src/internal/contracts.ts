import type { NativeCanvas, ImageSource, CompositeMode } from "../api.js";

/** All geometry uses device pixels, top-left origin, unless called out explicitly. */
export type Matrix = readonly [number, number, number, number, number, number];
export type Bounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;
/** Straight (not premultiplied) sRGB channels in [0,1]; premultiply once at GPU ingress. */
export type Color = readonly [number, number, number, number];
export type Paint =
  | Readonly<{ kind: "solid"; color: Color }>
  | Readonly<{
      kind: "linear-gradient";
      id: number;
      version: number;
      transform: Matrix;
      from: readonly [number, number];
      to: readonly [number, number];
      stops: readonly Readonly<{ offset: number; color: Color }>[];
    }>
  | Readonly<{
      kind: "repeat-pattern";
      id: number;
      version: number;
      image: HTMLImageElement;
      width: number;
      height: number;
    }>;
/** Live logical style reference. save/restore retains this object; draw captures a Paint. */
export interface PaintRef {
  readonly id: number;
  readonly version: number;
  snapshot(): Paint;
}
export interface DrawState {
  readonly transform: Matrix;
  readonly fill: Paint;
  readonly stroke: Paint;
  readonly alpha: number;
  readonly composite: CompositeMode;
  readonly filter: "none" | "brightness(120%)";
  readonly lineWidth: number;
  readonly lineCap: "butt" | "round";
  readonly lineJoin: "miter" | "round";
  readonly font: string;
  readonly textAlign: "start" | "left" | "center" | "right";
  readonly textBaseline: "alphabetic" | "top" | "middle" | "bottom";
  readonly clip: ClipSnapshot | null;
}
export type PathCommand =
  | Readonly<{ op: "closePath"; args: readonly []; transform: Matrix }>
  | Readonly<{
      op: "moveTo" | "lineTo";
      args: readonly [number, number];
      transform: Matrix;
    }>
  | Readonly<{
      op: "rect" | "quadraticCurveTo";
      args: readonly [number, number, number, number];
      transform: Matrix;
    }>
  | Readonly<{
      op: "arcTo";
      args: readonly [number, number, number, number, number];
      transform: Matrix;
    }>
  | Readonly<{
      op: "arc";
      args: readonly [number, number, number, number, number, boolean];
      transform: Matrix;
    }>
  | Readonly<{
      op: "ellipse";
      args: readonly [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        boolean,
      ];
      transform: Matrix;
    }>;
export interface PathSnapshot {
  readonly id: number;
  readonly commands: readonly PathCommand[];
}
export interface ClipSnapshot {
  readonly id: number;
  readonly parent: ClipSnapshot | null;
  readonly path: PathSnapshot;
  readonly rule: "nonzero" | "evenodd";
}
/** No GL object escapes a lease. A handle belongs to one device generation. */
export interface ResourceHandle {
  readonly id: number;
  readonly generation: number;
}
export interface ResourceLease {
  readonly handle: ResourceHandle;
  /** Idempotent; a stale generation cannot delete a newly allocated resource. */
  release(): void;
}
export interface RasterSource {
  readonly kind: "raster";
  readonly canvas: NativeCanvas;
  readonly bounds: Bounds;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly colorSpace: "srgb";
  readonly alpha: "straight";
  /** Native canvas bitmap is consumed synchronously before release or reuse. */
  release(): void;
}
export type DrawSource =
  | RasterSource
  | Readonly<{ kind: "rect"; bounds: Bounds; transform: Matrix; paint: Paint }>
  | Readonly<{
      kind: "image";
      image: ImageSource;
      sourceRect: Bounds;
      destinationRect: Bounds;
      transform: Matrix;
    }>
  | Readonly<{ kind: "empty" }>;
export interface DrawOperation {
  readonly generation: number;
  readonly kind: "draw" | "clear";
  readonly state: DrawState;
  readonly source: DrawSource;
  /** Device-space bounding box of source coverage; not the composite operation domain. */
  readonly sourceBounds: Bounds;
  /** null means canvas extent; source-in applies throughout this effective clip. */
  readonly clip: ClipSnapshot | null;
}
export interface GPUDevice {
  readonly generation: number;
  readonly status: "active" | "lost" | "disposed";
  readonly width: number;
  readonly height: number;
  /** Read/upload native sources now, never defer them until present. No ownership transfer. */
  draw(operation: DrawOperation): void;
  /** Internal only; scheduler calls this, no public flush. */
  present(generation: number): void;
  /** Validate before resizing; successful reset includes same size and increments generation. */
  resize(width: number, height: number): void;
  lose(): void;
  restore(): void;
  dispose(): void;
  acquireTexture(source: RasterSource | ImageSource): ResourceLease;
  /** Obtain a separate lease for a live handle; stale generations fail explicitly. */
  retain(handle: ResourceHandle): ResourceLease;
}
export interface ResourceOwner {
  /** Register each owned cleanup once. Unregister transfers cleanup responsibility to caller. */
  register(cleanup: () => void): () => void;
  /** Reverse order, drains even on failure; does not touch caller-owned target/source. */
  releaseAll(): void;
}
export interface Presenter {
  /** Coalesce presentation per approved task/microtask semantics; validate timing in browser tests. */
  request(generation: number): void;
  /** Invalidate pending work on resize, dispose, loss or restore. */
  invalidate(generation: number): void;
}
export interface Rasterizer {
  path(
    path: PathSnapshot,
    state: DrawState,
    mode: "fill" | "stroke",
  ): RasterSource;
  text(
    text: string,
    x: number,
    y: number,
    state: DrawState,
    mode: "fill" | "stroke",
  ): RasterSource;
  clip(
    path: PathSnapshot,
    rule: "nonzero" | "evenodd",
    bounds: Bounds,
  ): RasterSource;
  measureWidth(text: string, state: DrawState): number;
  clearCache(): void;
  dispose(): void;
}
export interface StateStore {
  save(): void;
  restore(): void;
  reset(): void;
  /** Captures current live paints into immutable versions for this draw. */
  snapshot(): DrawState;
  set(name: string, value: unknown): void;
  get(name: string): unknown;
}
export interface PathStore {
  begin(): void;
  append(command: PathCommand): void;
  snapshot(): PathSnapshot;
  reset(): void;
}
export interface FeatureEnvironment {
  readonly state: StateStore;
  readonly path: PathStore;
  readonly raster: Rasterizer;
  readonly gpu: GPUDevice;
  readonly presenter: Presenter;
  readonly resources: ResourceOwner;
}
export interface FeatureDefinition {
  readonly id: string;
  /** Member names from the context support manifest, owned by exactly one feature. */
  readonly members: Readonly<Record<string, PropertyDescriptor>>;
}
export type FeatureFactory = (
  environment: FeatureEnvironment,
) => FeatureDefinition;
