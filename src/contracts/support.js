/** Machine-readable scope, not implementation or test results. See docs/development/contracts.md. */
/**
 * @typedef {{id: string, target: string, name: string, kind: 'method'|'property', owner: string,
 * policy: 'supported'|'unsupported'|'readonly'|'forward',
 * arities?: number[], values?: string[], sources?: string[], default?: string|number,
 * otherValues?: string}} SupportRow
 */
/** @template T @param {T} value @returns {Readonly<T>} */
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
/** @type {readonly SupportRow[]} */
export const SUPPORT_MATRIX = freeze([
  {"id": "context.drawImage","target": "context","name": "drawImage","kind": "method","owner": "image","policy": "supported","arities": [3,5,9],"sources": ["HTMLImageElement","native-canvas"]},
  {"id": "context.fillRect","target": "context","name": "fillRect","kind": "method","owner": "rect","policy": "supported","arities": [4]},
  {"id": "context.clearRect","target": "context","name": "clearRect","kind": "method","owner": "rect","policy": "supported","arities": [4]},
  {"id": "context.strokeRect","target": "context","name": "strokeRect","kind": "method","owner": "rect","policy": "supported","arities": [4]},
  {"id": "context.beginPath","target": "context","name": "beginPath","kind": "method","owner": "path","policy": "supported","arities": [0]},
  {"id": "context.moveTo","target": "context","name": "moveTo","kind": "method","owner": "path","policy": "supported","arities": [2]},
  {"id": "context.lineTo","target": "context","name": "lineTo","kind": "method","owner": "path","policy": "supported","arities": [2]},
  {"id": "context.closePath","target": "context","name": "closePath","kind": "method","owner": "path","policy": "supported","arities": [0]},
  {"id": "context.arc","target": "context","name": "arc","kind": "method","owner": "path","policy": "supported","arities": [5,6]},
  {"id": "context.arcTo","target": "context","name": "arcTo","kind": "method","owner": "path","policy": "supported","arities": [5]},
  {"id": "context.quadraticCurveTo","target": "context","name": "quadraticCurveTo","kind": "method","owner": "path","policy": "supported","arities": [4]},
  {"id": "context.ellipse","target": "context","name": "ellipse","kind": "method","owner": "path","policy": "supported","arities": [7,8]},
  {"id": "context.rect","target": "context","name": "rect","kind": "method","owner": "path","policy": "supported","arities": [4]},
  {"id": "context.fill","target": "context","name": "fill","kind": "method","owner": "path","policy": "supported","arities": [0]},
  {"id": "context.stroke","target": "context","name": "stroke","kind": "method","owner": "path","policy": "supported","arities": [0]},
  {"id": "context.clip","target": "context","name": "clip","kind": "method","owner": "clip","policy": "supported","arities": [0,1],"values": ["evenodd"]},
  {"id": "context.save","target": "context","name": "save","kind": "method","owner": "state","policy": "supported","arities": [0]},
  {"id": "context.restore","target": "context","name": "restore","kind": "method","owner": "state","policy": "supported","arities": [0]},
  {"id": "context.translate","target": "context","name": "translate","kind": "method","owner": "state","policy": "supported","arities": [2]},
  {"id": "context.rotate","target": "context","name": "rotate","kind": "method","owner": "state","policy": "supported","arities": [1]},
  {"id": "context.scale","target": "context","name": "scale","kind": "method","owner": "state","policy": "supported","arities": [2]},
  {"id": "context.setTransform","target": "context","name": "setTransform","kind": "method","owner": "state","policy": "supported","arities": [6]},
  {"id": "context.fillText","target": "context","name": "fillText","kind": "method","owner": "text","policy": "supported","arities": [3]},
  {"id": "context.strokeText","target": "context","name": "strokeText","kind": "method","owner": "text","policy": "supported","arities": [3]},
  {"id": "context.measureText","target": "context","name": "measureText","kind": "method","owner": "text","policy": "supported","arities": [1]},
  {"id": "context.createPattern","target": "context","name": "createPattern","kind": "method","owner": "paint","policy": "supported","arities": [2],"sources": ["HTMLImageElement"],"values": ["repeat"]},
  {"id": "context.createLinearGradient","target": "context","name": "createLinearGradient","kind": "method","owner": "paint","policy": "supported","arities": [4]},
  {"id": "context.fillStyle","target": "context","name": "fillStyle","kind": "property","owner": "paint","policy": "supported","values": ["hex","rgba","CompatGradient","CompatPattern"],"default": "#000000"},
  {"id": "context.strokeStyle","target": "context","name": "strokeStyle","kind": "property","owner": "paint","policy": "supported","values": ["hex","rgba","CompatGradient","CompatPattern"],"default": "#000000"},
  {"id": "context.globalAlpha","target": "context","name": "globalAlpha","kind": "property","owner": "state","policy": "supported","values": ["finite-number-[0,1]"],"default": 1},
  {"id": "context.globalCompositeOperation","target": "context","name": "globalCompositeOperation","kind": "property","owner": "composite","policy": "supported","values": ["source-over","source-atop","source-in","lighter"],"default": "source-over"},
  {"id": "context.lineWidth","target": "context","name": "lineWidth","kind": "property","owner": "state","policy": "supported","values": ["positive-finite-number"],"default": 1},
  {"id": "context.lineCap","target": "context","name": "lineCap","kind": "property","owner": "state","policy": "supported","values": ["butt","round"],"default": "butt"},
  {"id": "context.lineJoin","target": "context","name": "lineJoin","kind": "property","owner": "state","policy": "supported","values": ["round"],"default": "miter"},
  {"id": "context.font","target": "context","name": "font","kind": "property","owner": "text","policy": "supported","values": ["valid-font-string"],"default": "10px sans-serif"},
  {"id": "context.textAlign","target": "context","name": "textAlign","kind": "property","owner": "text","policy": "supported","values": ["left","center","right"],"default": "start"},
  {"id": "context.textBaseline","target": "context","name": "textBaseline","kind": "property","owner": "text","policy": "supported","values": ["top","middle","bottom"],"default": "alphabetic"},
  {"id": "context.filter","target": "context","name": "filter","kind": "property","owner": "composite","policy": "supported","values": ["brightness(120%)","none"],"default": "none"},
  {"id": "context.canvas","target": "context","name": "canvas","kind": "property","owner": "canvas","policy": "readonly"},
  {"id": "context.getImageData","target": "context","name": "getImageData","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.putImageData","target": "context","name": "putImageData","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.createImageData","target": "context","name": "createImageData","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.bezierCurveTo","target": "context","name": "bezierCurveTo","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.createRadialGradient","target": "context","name": "createRadialGradient","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.createConicGradient","target": "context","name": "createConicGradient","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.setLineDash","target": "context","name": "setLineDash","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.getLineDash","target": "context","name": "getLineDash","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.resetTransform","target": "context","name": "resetTransform","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.transform","target": "context","name": "transform","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.getTransform","target": "context","name": "getTransform","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.isPointInPath","target": "context","name": "isPointInPath","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.isPointInStroke","target": "context","name": "isPointInStroke","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.roundRect","target": "context","name": "roundRect","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.reset","target": "context","name": "reset","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.drawFocusIfNeeded","target": "context","name": "drawFocusIfNeeded","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.scrollPathIntoView","target": "context","name": "scrollPathIntoView","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.getContextAttributes","target": "context","name": "getContextAttributes","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.isContextLost","target": "context","name": "isContextLost","kind": "method","owner": "context","policy": "unsupported"},
  {"id": "context.imageSmoothingEnabled","target": "context","name": "imageSmoothingEnabled","kind": "property","owner": "context","policy": "unsupported"},
  {"id": "context.imageSmoothingQuality","target": "context","name": "imageSmoothingQuality","kind": "property","owner": "context","policy": "unsupported"},
  {"id": "context.shadowBlur","target": "context","name": "shadowBlur","kind": "property","owner": "context","policy": "unsupported"},
  {"id": "context.shadowColor","target": "context","name": "shadowColor","kind": "property","owner": "context","policy": "unsupported"},
  {"id": "context.shadowOffsetX","target": "context","name": "shadowOffsetX","kind": "property","owner": "context","policy": "unsupported"},
  {"id": "context.shadowOffsetY","target": "context","name": "shadowOffsetY","kind": "property","owner": "context","policy": "unsupported"},
  {"id": "context.miterLimit","target": "context","name": "miterLimit","kind": "property","owner": "context","policy": "unsupported"},
  {"id": "context.lineDashOffset","target": "context","name": "lineDashOffset","kind": "property","owner": "context","policy": "unsupported"},
  {"id": "context.direction","target": "context","name": "direction","kind": "property","owner": "context","policy": "unsupported"},
  {"id": "context.fontKerning","target": "context","name": "fontKerning","kind": "property","owner": "context","policy": "unsupported"},
  {"id": "context.fontStretch","target": "context","name": "fontStretch","kind": "property","owner": "context","policy": "unsupported"},
  {"id": "context.fontVariantCaps","target": "context","name": "fontVariantCaps","kind": "property","owner": "context","policy": "unsupported"},
  {"id": "context.textRendering","target": "context","name": "textRendering","kind": "property","owner": "context","policy": "unsupported"},
  {"id": "context.letterSpacing","target": "context","name": "letterSpacing","kind": "property","owner": "context","policy": "unsupported"},
  {"id": "context.wordSpacing","target": "context","name": "wordSpacing","kind": "property","owner": "context","policy": "unsupported"},
  {"id": "context.lang","target": "context","name": "lang","kind": "property","owner": "context","policy": "unsupported"},
  {"id": "canvas.width","target": "canvas","name": "width","kind": "property","owner": "canvas","policy": "supported"},
  {"id": "canvas.height","target": "canvas","name": "height","kind": "property","owner": "canvas","policy": "supported"},
  {"id": "canvas.getContext","target": "canvas","name": "getContext","kind": "method","owner": "canvas","policy": "supported","arities": [1],"values": ["2d"],"otherValues": "null"},
  {"id": "canvas.dispose","target": "canvas","name": "dispose","kind": "method","owner": "lifecycle","policy": "supported","arities": [0]},
  {"id": "canvas.toDataURL","target": "canvas","name": "toDataURL","kind": "method","owner": "canvas","policy": "unsupported"},
  {"id": "canvas.toBlob","target": "canvas","name": "toBlob","kind": "method","owner": "canvas","policy": "unsupported"},
  {"id": "canvas.captureStream","target": "canvas","name": "captureStream","kind": "method","owner": "canvas","policy": "unsupported"},
  {"id": "canvas.transferControlToOffscreen","target": "canvas","name": "transferControlToOffscreen","kind": "method","owner": "canvas","policy": "unsupported"},
  {"id": "canvas.style","target": "canvas","name": "style","kind": "property","owner": "canvas","policy": "forward"},
  {"id": "canvas.addEventListener","target": "canvas","name": "addEventListener","kind": "method","owner": "canvas","policy": "forward"},
  {"id": "canvas.removeEventListener","target": "canvas","name": "removeEventListener","kind": "method","owner": "canvas","policy": "forward"},
  {"id": "canvas.dispatchEvent","target": "canvas","name": "dispatchEvent","kind": "method","owner": "canvas","policy": "forward"},
  {"id": "canvas.getBoundingClientRect","target": "canvas","name": "getBoundingClientRect","kind": "method","owner": "canvas","policy": "forward"},
  {"id": "gradient.addColorStop","target": "gradient","name": "addColorStop","kind": "method","owner": "paint","policy": "supported","arities": [2]},
  {"id": "pattern.setTransform","target": "pattern","name": "setTransform","kind": "method","owner": "paint","policy": "unsupported"},
  {"id": "metrics.width","target": "metrics","name": "width","kind": "property","owner": "text","policy": "readonly"},
  {"id": "metrics.actualBoundingBoxLeft","target": "metrics","name": "actualBoundingBoxLeft","kind": "property","owner": "text","policy": "unsupported"},
  {"id": "metrics.actualBoundingBoxRight","target": "metrics","name": "actualBoundingBoxRight","kind": "property","owner": "text","policy": "unsupported"},
  {"id": "metrics.actualBoundingBoxAscent","target": "metrics","name": "actualBoundingBoxAscent","kind": "property","owner": "text","policy": "unsupported"},
  {"id": "metrics.actualBoundingBoxDescent","target": "metrics","name": "actualBoundingBoxDescent","kind": "property","owner": "text","policy": "unsupported"},
  {"id": "metrics.fontBoundingBoxAscent","target": "metrics","name": "fontBoundingBoxAscent","kind": "property","owner": "text","policy": "unsupported"},
  {"id": "metrics.fontBoundingBoxDescent","target": "metrics","name": "fontBoundingBoxDescent","kind": "property","owner": "text","policy": "unsupported"},
  {"id": "metrics.emHeightAscent","target": "metrics","name": "emHeightAscent","kind": "property","owner": "text","policy": "unsupported"},
  {"id": "metrics.emHeightDescent","target": "metrics","name": "emHeightDescent","kind": "property","owner": "text","policy": "unsupported"},
  {"id": "metrics.hangingBaseline","target": "metrics","name": "hangingBaseline","kind": "property","owner": "text","policy": "unsupported"},
  {"id": "metrics.alphabeticBaseline","target": "metrics","name": "alphabeticBaseline","kind": "property","owner": "text","policy": "unsupported"},
  {"id": "metrics.ideographicBaseline","target": "metrics","name": "ideographicBaseline","kind": "property","owner": "text","policy": "unsupported"}
]);

/** @param {string} target @param {string} name */
export function lookupMember(target, name) {
  return SUPPORT_MATRIX.find(row => row.target === target && row.name === name);
}

/** Stable minimum case inventory. Add finer cases; never recycle an existing ID. */
export const REQUIRED_CASES = freeze(SUPPORT_MATRIX.flatMap(row => {
  /** @type {import('../../types/internal/testing.js').CaseMetadata[]} */
  const cases = [{ id: `${row.id}.contract`, requirements: [row.id], kind: 'semantic' }];
  for (const arity of row.arities || []) cases.push({ id: `${row.id}.arity-${arity}`, requirements: [row.id], kind: 'semantic' });
  for (const value of row.values || []) cases.push({ id: `${row.id}.value-${encodeURIComponent(value)}`, requirements: [row.id], kind: 'semantic' });
  for (const source of row.sources || []) cases.push({ id: `${row.id}.source-${source}`, requirements: [row.id], kind: 'semantic' });
  if (['drawImage', 'fillRect', 'clearRect', 'strokeRect', 'fill', 'stroke', 'clip', 'fillText', 'strokeText'].includes(row.name) && row.target === 'context') {
    cases.push({ id: `${row.id}.render`, requirements: [row.id], kind: 'render' });
  }
  return cases;
}));
