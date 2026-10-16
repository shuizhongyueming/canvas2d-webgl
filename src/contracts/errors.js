/** Stable library failures; supported API input errors retain their native semantics. */
export const ERROR_CODES = Object.freeze({
  DISPOSED: 'disposed',
  UNSUPPORTED_API: 'unsupported-api',
  INVALID_TARGET: 'invalid-target',
  INVALID_FACTORY: 'invalid-factory',
  WEBGL_UNAVAILABLE: 'webgl-unavailable',
  CONTEXT_ATTRIBUTES: 'context-attributes-mismatch',
  CAPABILITY: 'capability-unavailable',
  SIZE_UNSUPPORTED: 'size-unsupported',
  RESOURCE_LIMIT: 'resource-limit',
  INITIALIZATION: 'initialization-failed',
  NOT_IMPLEMENTED: 'not-implemented',
  CONTRACT: 'contract-violation',
});

/** @typedef {typeof ERROR_CODES[keyof typeof ERROR_CODES]} ErrorCode */
/** @param {ErrorCode} code @param {string} detail @returns {Error & {code: ErrorCode}} */
export function createCompatError(code, detail) {
  return Object.assign(new Error(`${code}: ${detail}`), { code });
}

/**
 * Drain owned resources in reverse acquisition order. Never destroy the caller's
 * canvas or actively lose its context. The allocation error remains authoritative.
 * @param {unknown} failure @param {Array<() => void>} cleanups @returns {never}
 */
export function rollbackInitialization(failure, cleanups) {
  while (cleanups.length) {
    try { cleanups.pop()?.(); } catch { /* Continue releasing remaining resources. */ }
  }
  throw failure;
}
