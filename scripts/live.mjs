import { fileURLToPath } from "node:url";
import { createLiveServer } from "./live-server.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const values = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const match = /^--(port|prepare-timeout|run-timeout)=(.*)$/.exec(
    process.argv[index] ?? "",
  );
  if (!match) {
    console.error(
      "Usage: pnpm run test:live [-- --port=0 --prepare-timeout=10000 --run-timeout=10000]",
    );
    process.exit(2);
  }
  values.set(match[1], Number(match[2]));
}
const port = values.get("port") ?? 0;
const prepare = values.get("prepare-timeout") ?? 10000;
const run = values.get("run-timeout") ?? 10000;
if (![port, prepare, run].every(Number.isFinite) || port < 0 || port > 65535) {
  console.error("Invalid live tool options");
  process.exit(2);
}
const server = await createLiveServer({ root, port });
console.log(
  `Canvas live comparison: ${server.url}/?prepare=${prepare}&run=${run}`,
);
console.log("Press Ctrl+C to stop.");
const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
