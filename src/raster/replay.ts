import type { PathSnapshot } from "../internal/contracts.js";
import type { Native2DContext } from "./native.js";
import { offsetMatrix } from "./matrix.js";

/**
 * Re-issue the recorded sequence on a native 2D context. Each command is replayed
 * under its own construction-time transform (shifted into asset space), so the
 * native rasterizer reproduces the exact geometry the game would have produced.
 */
export function replayPath(
  ctx: Native2DContext,
  path: PathSnapshot,
  offsetX: number,
  offsetY: number,
): void {
  ctx.beginPath();
  for (const command of path.commands) {
    const [a, b, c, d, e, f] = offsetMatrix(command.transform, offsetX, offsetY);
    ctx.setTransform(a, b, c, d, e, f);
    switch (command.op) {
      case "closePath":
        ctx.closePath();
        break;
      case "moveTo":
      case "lineTo":
        ctx[command.op](command.args[0], command.args[1]);
        break;
      case "rect":
      case "quadraticCurveTo":
        ctx[command.op](
          command.args[0],
          command.args[1],
          command.args[2],
          command.args[3],
        );
        break;
      case "arcTo":
        ctx.arcTo(
          command.args[0],
          command.args[1],
          command.args[2],
          command.args[3],
          command.args[4],
        );
        break;
      case "arc":
        ctx.arc(
          command.args[0],
          command.args[1],
          command.args[2],
          command.args[3],
          command.args[4],
          command.args[5],
        );
        break;
      case "ellipse":
        ctx.ellipse(
          command.args[0],
          command.args[1],
          command.args[2],
          command.args[3],
          command.args[4],
          command.args[5],
          command.args[6],
          command.args[7],
        );
        break;
    }
  }
}
