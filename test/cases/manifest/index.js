// Declarations only: none of these records represents an executed or passing test.
export { REQUIRED_CASES as apiCases } from '../../../src/contracts/support.js';
export const interactionCases = Object.freeze([
  { id: 'CAN-02.identity', requirements: ['CAN-02'], kind: 'semantic' },
  { id: 'CAN-04.same-size-reset', requirements: ['CAN-04'], kind: 'combined' },
  { id: 'CAN-05.microtask-order', requirements: ['CAN-05'], kind: 'combined' },
  { id: 'CAN-05.display-target', requirements: ['CAN-05'], kind: 'render' },
  { id: 'IMG-02.same-task-mutations', requirements: ['IMG-02'], kind: 'combined' },
  { id: 'IMG-03.reject-compat-source', requirements: ['IMG-03'], kind: 'semantic' },
  { id: 'ACC-03.source-in-outside-source', requirements: ['ACC-03'], kind: 'combined' },
  { id: 'ACC-03.evenodd-nested-clip', requirements: ['ACC-03'], kind: 'render' },
  { id: 'ACC-03.clear-clip-transform', requirements: ['ACC-03'], kind: 'render' },
  { id: 'ACC-03.paint-version', requirements: ['ACC-03'], kind: 'combined' },
  { id: 'ACC-03.brightness-alpha', requirements: ['ACC-03'], kind: 'render' },
  { id: 'LIFE-01.dispose-pending-present', requirements: ['LIFE-01'], kind: 'combined' },
  { id: 'LIFE-02.loss-before-present', requirements: ['LIFE-02'], kind: 'combined' },
  { id: 'LIFE-03.restore-empty-generation', requirements: ['LIFE-03'], kind: 'combined' },
].map(record => Object.freeze({ ...record, requirements: Object.freeze(record.requirements) })));
