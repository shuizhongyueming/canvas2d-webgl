import test from 'node:test';
import assert from 'node:assert/strict';
import { owners, stateOf, ticketOf, TICKETS } from '../../scripts/matrix.mjs';

const ownerOf = owners();
const entry = (id, requirements, kind = 'semantic') => ({ id, requirements, kind });

test('required cases are attributed to the ticket that owns their members', () => {
  assert.equal(ticketOf(entry('a', ['context.fillRect']), ownerOf).id, 'shuizhongyueming/canvas2d-webgl#17');
  assert.equal(ticketOf(entry('b', ['context.drawImage']), ownerOf).id, 'shuizhongyueming/canvas2d-webgl#18');
  assert.equal(ticketOf(entry('c', ['context.filter']), ownerOf).id, 'shuizhongyueming/canvas2d-webgl#22');
  assert.equal(ticketOf(entry('d', ['ACC-03']), ownerOf).id, 'shuizhongyueming/canvas2d-webgl#24');
  assert.equal(ticketOf(entry('e', ['LIFE-01']), ownerOf).id, 'shuizhongyueming/canvas2d-webgl#23');
  // A member outranks a prefix: an interaction case that names drawImage still
  // belongs to the image ticket.
  assert.equal(ticketOf(entry('f', ['ACC-03', 'context.drawImage']), ownerOf).id, 'shuizhongyueming/canvas2d-webgl#18');
  assert.equal(ticketOf(entry('g', ['CAN-02']), ownerOf).id, 'earlier');
});

test('every matrix owner is assigned to exactly one ticket group', () => {
  const rows = new Set(TICKETS.flatMap(ticket => ticket.rows));
  for (const owner of new Set(ownerOf.values())) assert.ok(rows.has(owner), `unassigned owner ${owner}`);
});

test('review states never turn pending or executed pixels into a pass', () => {
  const render = entry('r', ['context.fillRect'], 'render');
  const semantic = entry('s', ['context.fillRect']);
  const result = (extra) => ({ execution: 'executed', semantic: 'not-applicable', render: 'pending-review', ...extra });
  assert.equal(stateOf(render, result({})), 'pending-review');
  assert.equal(stateOf(render, result({ render: 'accepted' })), 'review-accepted');
  assert.equal(stateOf(render, result({ render: 'rejected' })), 'review-rejected');
  assert.equal(stateOf(semantic, result({ semantic: 'pass' })), 'semantic-pass');
  assert.equal(stateOf(semantic, result({})), 'semantic-missing');
  assert.equal(stateOf(semantic, result({ semantic: 'pass', execution: 'blocked' })), 'blocked');
  assert.equal(stateOf(semantic, result({ semantic: 'pass', execution: 'not-run', error: 'missing-implementation' })), 'missing-implementation');
  assert.equal(stateOf(semantic, result({ semantic: 'fail' })), 'semantic-fail');
  assert.equal(stateOf(semantic, undefined), 'missing');
});
