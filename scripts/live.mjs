// 实时渲染对比工具本地启动入口（issue #66 预留）。
// 只校验构建产物存在；本地服务与页面由协调票（#71）实现。
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(
  new URL("../dist/live/contracts/index.js", import.meta.url),
);
try {
  await access(root);
} catch {
  console.error("Missing dist/live build; run pnpm run build first.");
  process.exit(1);
}
console.error(
  "not-implemented: 本地服务由工具协调票（#71）实现；本入口仅验证构建产物。",
);
process.exit(1);
