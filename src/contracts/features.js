import { SUPPORT_MATRIX, lookupMember } from './support.js';
import { createCompatError, ERROR_CODES } from './errors.js';

/**
 * Construct descriptors before touching a private context object. No global
 * registry: one collection per canvas, validated atomically before installation.
 * @param {readonly import('../../types/internal/contracts.js').FeatureDefinition[]} features
 * @returns {PropertyDescriptorMap}
 */
export function contextDescriptors(features) {
  /** @type {Map<string, PropertyDescriptor>} */
  const members = new Map();
  const ids = new Set();
  for (const feature of features) {
    if (!feature.id || ids.has(feature.id)) fail(`duplicate or empty feature: ${feature.id}`);
    ids.add(feature.id);
    for (const [name, descriptor] of Object.entries(feature.members)) {
      const row = lookupMember('context', name);
      if (!row || row.policy === 'unsupported' || row.owner !== feature.id || members.has(name)) {
        fail(`invalid ownership: ${feature.id}.${name}`);
      }
      if (row.kind === 'method') {
        if (typeof descriptor.value !== 'function' || 'get' in descriptor || 'set' in descriptor) fail(`invalid method: ${name}`);
      } else {
        if ('value' in descriptor || 'writable' in descriptor || typeof descriptor.get !== 'function') fail(`invalid property: ${name}`);
        if (row.policy === 'readonly' ? descriptor.set !== undefined : typeof descriptor.set !== 'function') fail(`invalid setter: ${name}`);
      }
      members.set(name, { ...descriptor, configurable: false, enumerable: true });
    }
  }
  /** @type {PropertyDescriptorMap} */
  const descriptors = Object.create(null);
  for (const row of SUPPORT_MATRIX.filter(row => row.target === 'context')) {
    const errorCode = row.policy === 'unsupported' ? ERROR_CODES.UNSUPPORTED_API : ERROR_CODES.NOT_IMPLEMENTED;
    const unavailable = () => { throw createCompatError(errorCode, row.name); };
    descriptors[row.name] = members.get(row.name) || (row.kind === 'method'
      ? { value: unavailable, enumerable: true, configurable: false, writable: false }
      : { get: unavailable, ...(row.policy === 'readonly' ? {} : { set: unavailable }), enumerable: true, configurable: false });
  }
  return descriptors;
}

/** @param {string} detail @returns {never} */
function fail(detail) { throw createCompatError(ERROR_CODES.CONTRACT, detail); }
