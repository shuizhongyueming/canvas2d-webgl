import { createCompatError, ERROR_CODES } from './contracts/errors.js';

/**
 * Public entry point reserved by the approved specification. Rendering is not
 * implemented in the foundation ticket; never return a successful empty context.
 * @template {import('../types/index.js').TargetCanvas} T
 * @param {T} targetCanvas
 * @param {import('../types/index.js').CompatOptions} [options]
 * @returns {import('../types/index.js').CompatCanvas<T>}
 */
export function createCompatCanvas(targetCanvas, options) {
  throw createCompatError(ERROR_CODES.NOT_IMPLEMENTED, 'createCompatCanvas: renderer implementation pending');
}
