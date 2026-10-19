/** Public surface only. Internal contracts and test hooks are not package exports. */
export interface TargetCanvas {
  width: number;
  height: number;
  getContext(type: string, options?: object): unknown;
}
export interface NativeCanvas {
  width: number;
  height: number;
  getContext(
    type: "2d",
    options?: CanvasRenderingContext2DSettings,
  ): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
}
export interface CompatOptions {
  createOffscreenCanvas?: (width: number, height: number) => NativeCanvas;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}
export type ImageSource = HTMLImageElement | NativeCanvas;
declare const gradientBrand: unique symbol;
declare const patternBrand: unique symbol;
export interface CompatGradient {
  readonly [gradientBrand]: true;
  addColorStop(offset: number, color: string): void;
}
export interface CompatPattern {
  readonly [patternBrand]: true;
}
export type PaintStyle = string | CompatGradient | CompatPattern;
export type CompositeMode =
  | "source-over"
  | "source-atop"
  | "source-in"
  | "lighter";
export interface CompatTextMetrics {
  readonly width: number;
}
export interface CompatContext<T extends TargetCanvas = TargetCanvas> {
  readonly canvas: CompatCanvas<T>;
  fillStyle: PaintStyle;
  strokeStyle: PaintStyle;
  globalAlpha: number;
  globalCompositeOperation: CompositeMode;
  lineWidth: number;
  lineCap: "butt" | "round";
  get lineJoin(): "miter" | "round";
  set lineJoin(value: "round");
  font: string;
  get textAlign(): "start" | "left" | "center" | "right";
  set textAlign(value: "left" | "center" | "right");
  get textBaseline(): "alphabetic" | "top" | "middle" | "bottom";
  set textBaseline(value: "top" | "middle" | "bottom");
  filter: "none" | "brightness(120%)";
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): void;
  drawImage(image: ImageSource, dx: number, dy: number): void;
  drawImage(
    image: ImageSource,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  drawImage(
    image: ImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(
    x: number,
    y: number,
    radius: number,
    start: number,
    end: number,
    anticlockwise?: boolean,
  ): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    start: number,
    end: number,
    anticlockwise?: boolean,
  ): void;
  rect(x: number, y: number, width: number, height: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  clip(rule: "evenodd"): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  measureText(text: string): CompatTextMetrics;
  createPattern(
    image: HTMLImageElement,
    repetition: "repeat",
  ): CompatPattern | null;
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): CompatGradient;
}
type Intercepted = "width" | "height" | "getContext" | "dispose";
type Excluded =
  | "toDataURL"
  | "toBlob"
  | "captureStream"
  | "transferControlToOffscreen";
export type CompatCanvas<T extends TargetCanvas = TargetCanvas> = Omit<
  T,
  Intercepted | Excluded
> & {
  width: number;
  height: number;
  getContext(type: "2d"): CompatContext<T>;
  getContext(type: string): CompatContext<T> | null;
  dispose(): void;
};
