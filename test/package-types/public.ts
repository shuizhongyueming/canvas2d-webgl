import { createCompatCanvas, type NativeCanvas } from 'canvas2d-webgl';
const canvas = createCompatCanvas(document.createElement('canvas'));
const ctx = canvas.getContext('2d');
ctx.drawImage(new Image(), 1, 2);
ctx.drawImage(document.createElement('canvas'), 1, 2, 3, 4);
ctx.drawImage(new Image(), 0, 0, 2, 2, 1, 1, 4, 4);
ctx.ellipse(0, 0, 1, 2, 0, 0, 6, false);
ctx.clip('evenodd');
ctx.fillStyle = ctx.createLinearGradient(0, 0, 2, 2);
ctx.measureText('test').width;
canvas.style.display = 'block';
canvas.getBoundingClientRect();
const platform: NativeCanvas = new OffscreenCanvas(1, 1);
createCompatCanvas(document.createElement('canvas'), { createOffscreenCanvas: () => platform });
// @ts-expect-error Public readback is excluded.
ctx.getImageData(0, 0, 1, 1);
// @ts-expect-error Compatibility canvases are not native image sources.
ctx.drawImage(canvas, 0, 0);
// @ts-expect-error Pattern source is image-only.
ctx.createPattern(document.createElement('canvas'), 'repeat');
// @ts-expect-error No maxWidth in the approved overload.
ctx.fillText('test', 1, 2, 3);
// @ts-expect-error Extra TextMetrics fields are excluded.
ctx.measureText('test').actualBoundingBoxLeft;
// @ts-expect-error Getter allows native default miter, setter does not extend scope.
ctx.lineJoin = 'miter';
// @ts-expect-error Public export is excluded, even for a native DOM target.
canvas.toDataURL();
// @ts-expect-error Fill rule overload not approved.
ctx.fill('evenodd');
