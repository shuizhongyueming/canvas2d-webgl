import test from "node:test";
import assert from "node:assert/strict";
import { owners, stateOf, ticketOf, TICKETS } from "../../scripts/matrix.mjs";

const ownerOf = owners();
const entry = (id, requirements, kind = "semantic") => ({
  id,
  requirements,
  kind,
});

test("required cases are attributed to the ticket that owns their members", () => {
  assert.equal(
    ticketOf(entry("a", ["context.fillRect"]), ownerOf).id,
    "shuizhongyueming/canvas2d-webgl#17",
  );
  assert.equal(
    ticketOf(entry("b", ["context.drawImage"]), ownerOf).id,
    "shuizhongyueming/canvas2d-webgl#18",
  );
  assert.equal(
    ticketOf(entry("c", ["context.filter"]), ownerOf).id,
    "shuizhongyueming/canvas2d-webgl#22",
  );
  assert.equal(
    ticketOf(entry("d", ["ACC-03"]), ownerOf).id,
    "shuizhongyueming/canvas2d-webgl#24",
  );
  assert.equal(
    ticketOf(entry("e", ["LIFE-01"]), ownerOf).id,
    "shuizhongyueming/canvas2d-webgl#23",
  );
  // A cross-feature case id decides its ticket even when it drives members
  // owned by other tickets.
  assert.equal(
    ticketOf(
      entry("ACC-03.entry-fillRect-source-in", ["ACC-03", "context.fillRect"]),
      ownerOf,
    ).id,
    "shuizhongyueming/canvas2d-webgl#24",
  );
  // Without a prefix anywhere, the member owner decides.
  assert.equal(
    ticketOf(entry("f", ["context.drawImage"]), ownerOf).id,
    "shuizhongyueming/canvas2d-webgl#18",
  );
  assert.equal(ticketOf(entry("g", ["CAN-02"]), ownerOf).id, "earlier");
});

test("every matrix owner is assigned to exactly one ticket group", () => {
  const rows = new Set(TICKETS.flatMap((ticket) => ticket.rows));
  for (const owner of new Set(ownerOf.values()))
    assert.ok(rows.has(owner), `unassigned owner ${owner}`);
});

test("review states never turn pending or executed pixels into a pass", () => {
  const render = entry("r", ["context.fillRect"], "render");
  const semantic = entry("s", ["context.fillRect"]);
  const result = (extra) => ({
    execution: "executed",
    semantic: "not-applicable",
    render: "not-applicable",
    ...extra,
  });
  const pixels = result({ render: "pending-review" });
  assert.equal(stateOf(render, pixels), "pending-review");
  assert.equal(
    stateOf(render, result({ render: "accepted" })),
    "review-accepted",
  );
  assert.equal(
    stateOf(render, result({ render: "rejected" })),
    "review-rejected",
  );
  assert.equal(
    stateOf(semantic, result({ semantic: "pass" })),
    "semantic-pass",
  );
  // A combined case passes semantically but still needs its pair reviewed.
  const combined = entry("c", ["ACC-03"], "combined");
  assert.equal(
    stateOf(combined, result({ semantic: "pass", render: "pending-review" })),
    "pending-review",
  );
  assert.equal(
    stateOf(combined, result({ semantic: "pass", render: "accepted" })),
    "review-accepted",
  );
  assert.equal(
    stateOf(combined, result({ semantic: "pass", render: "rejected" })),
    "review-rejected",
  );
  assert.equal(stateOf(semantic, result({})), "semantic-missing");
  assert.equal(
    stateOf(semantic, result({ semantic: "pass", execution: "blocked" })),
    "blocked",
  );
  assert.equal(
    stateOf(
      semantic,
      result({
        semantic: "pass",
        execution: "not-run",
        error: "missing-implementation",
      }),
    ),
    "missing-implementation",
  );
  assert.equal(
    stateOf(semantic, result({ semantic: "fail" })),
    "semantic-fail",
  );
  assert.equal(stateOf(semantic, undefined), "missing");
});
