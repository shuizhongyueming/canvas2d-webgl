import { SUPPORT_MATRIX } from "../dist/contracts/support.js";

/**
 * Reconciliation policy for one collected run: who owns each required case and
 * how a result maps to a reconciliation state. Pure functions only; the CLI
 * wrapper is scripts/acceptance-matrix.mjs.
 */

/**
 * Who owns each prerequisite ticket. `rows` names the matrix owners whose
 * required cases belong to the ticket; `prefixes` names the interaction case
 * requirement prefixes that the ticket is accountable for.
 */
export const TICKETS = Object.freeze([
  {
    id: "shuizhongyueming/canvas2d-webgl#17",
    label: "矩形三方法",
    rows: ["rect"],
    prefixes: ["CAN-04", "CAN-05"],
  },
  {
    id: "shuizhongyueming/canvas2d-webgl#18",
    label: "drawImage 重载与外部 canvas 顺序",
    rows: ["image"],
    prefixes: ["IMG-02", "IMG-03", "ACC-04"],
  },
  {
    id: "shuizhongyueming/canvas2d-webgl#19",
    label: "公开路径填充描边及 paint 集成",
    rows: ["path"],
    prefixes: [],
  },
  {
    id: "shuizhongyueming/canvas2d-webgl#20",
    label: "文字光栅化、布局与 width 测量",
    rows: ["text"],
    prefixes: [],
  },
  {
    id: "shuizhongyueming/canvas2d-webgl#21",
    label: "模板裁剪、evenodd 与状态恢复",
    rows: ["clip"],
    prefixes: [],
  },
  {
    id: "shuizhongyueming/canvas2d-webgl#22",
    label: "操作级合成模式与 brightness",
    rows: ["composite"],
    prefixes: [],
  },
  {
    id: "shuizhongyueming/canvas2d-webgl#23",
    label: "尺寸重置、dispose 与上下文恢复",
    rows: ["lifecycle"],
    prefixes: ["LIFE-01", "LIFE-02", "LIFE-03", "ACC-05"],
  },
  {
    id: "shuizhongyueming/canvas2d-webgl#24",
    label: "跨特性组合（本票新增）",
    rows: [],
    prefixes: ["ACC-03"],
  },
  {
    id: "earlier",
    label: "更早的工程/状态/画布/paint 票",
    rows: ["canvas", "state", "paint", "gpu", "context"],
    prefixes: [
      "REN-01",
      "REN-02",
      "API-01",
      "API-02",
      "CAN-01",
      "CAN-02",
      "CAN-03",
      "ACC-01",
    ],
  },
]);

/**
 * Attribution order: the case id's own spec prefix (an interaction case names
 * the ticket that introduced it), then a required requirement's prefix, then
 * the matrix owner of the members it exercises. A member that also appears in
 * a cross-feature case does not take the case away from that interaction.
 */
export function ticketOf(entry, ownerOf) {
  for (const ticket of TICKETS)
    if (ticket.prefixes.some((prefix) => entry.id.startsWith(prefix)))
      return ticket;
  for (const ticket of TICKETS)
    if (
      entry.requirements.some((requirement) =>
        ticket.prefixes.some((prefix) => requirement.startsWith(prefix)),
      )
    )
      return ticket;
  const owners = entry.requirements
    .map((requirement) => ownerOf.get(requirement))
    .filter((owner) => owner !== undefined);
  for (const ticket of TICKETS)
    if (owners.some((owner) => ticket.rows.includes(owner))) return ticket;
  return undefined;
}

export function owners() {
  return new Map(SUPPORT_MATRIX.map((row) => [row.id, row.owner]));
}

/**
 * Classify one case entry against its collected result. Render cases can only
 * reach acceptance through review; a missing entry is a missing definition,
 * never a pass.
 */
export function stateOf(entry, result) {
  if (!result) return "missing";
  if (result.execution !== "executed")
    return result.error === "missing-implementation"
      ? "missing-implementation"
      : "blocked";
  if (result.semantic === "fail") return "semantic-fail";
  if (entry.kind === "render")
    return result.render === "accepted"
      ? "review-accepted"
      : result.render === "rejected"
        ? "review-rejected"
        : "pending-review";
  // Combined cases carry both: assertions and observations decide the
  // semantic verdict, and their captured pair still needs human+AI review.
  if (result.semantic !== "pass") return "semantic-missing";
  if (result.render === "accepted") return "review-accepted";
  if (result.render === "rejected") return "review-rejected";
  return result.render === "pending-review"
    ? "pending-review"
    : "semantic-pass";
}

/** Execution state ordering used by every table. */
export const STATES = Object.freeze([
  "semantic-pass",
  "pending-review",
  "review-accepted",
  "review-rejected",
  "semantic-fail",
  "blocked",
  "missing-implementation",
  "semantic-missing",
  "missing",
]);
