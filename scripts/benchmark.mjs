import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { provenance } from "./provenance.mjs";
import { assertCurrentBuild } from "./build-state.mjs";
import { hash } from "./hash.mjs";
import { benchmarkResult, passesBenchmark } from "./benchmark-result.mjs";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    adapter: { type: "string" },
    output: { type: "string" },
    mode: { type: "string", default: "both" },
    duration: { type: "string", default: "10000" },
    warmup: { type: "string", default: "3000" },
    width: { type: "string", default: "390" },
    height: { type: "string", default: "844" },
    dpr: { type: "string", default: "2" },
    target: { type: "string", default: "30" },
    software: { type: "boolean", default: false },
  },
});
if (!values.url || !values.adapter || !values.output)
  throw Error("Expected --url, --adapter and --output");
if (!["both", "native", "webgl"].includes(values.mode))
  throw Error("Invalid --mode");
const numeric = (key, min) => {
  const n = Number(values[key]);
  if (!Number.isFinite(n) || n < min) throw Error(`Invalid --${key}`);
  return n;
};
const duration = numeric("duration", 1000),
  warmup = numeric("warmup", 0),
  target = numeric("target", 1);
const viewport = { width: numeric("width", 1), height: numeric("height", 1) },
  deviceScaleFactor = numeric("dpr", 1);
const root = fileURLToPath(new URL("../", import.meta.url));
await assertCurrentBuild(root);
const source = await provenance(root);
const build = JSON.parse(
  await readFile(resolve(root, ".build/stamp.json"), "utf8"),
);
const adapterPath = resolve(values.adapter),
  adapterHash = hash(await readFile(adapterPath));
const adapter = await import(pathToFileURL(adapterPath).href);
for (const name of ["ready", "start", "stop"])
  if (typeof adapter[name] !== "function")
    throw Error(`Adapter needs ${name}()`);
const metadata = adapter.metadata ? await adapter.metadata() : {};
const directory = resolve(values.output);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  args: values.software
    ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    : ["--use-angle=metal"],
});
const browserVersion = browser.version(),
  results = [];
try {
  for (const mode of values.mode === "both"
    ? ["native", "webgl"]
    : [values.mode]) {
    // Fresh sequential contexts prevent the other renderer from consuming frames.
    const context = await browser.newContext({ viewport, deviceScaleFactor });
    try {
      const page = await context.newPage(),
        errors = [],
        scripts = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        if (
          response.request().resourceType() === "script" ||
          /\.js(?:\?|$)/.test(response.url())
        ) {
          scripts.push(
            (async () => {
              try {
                const body = await response.body();
                return {
                  url: response.url(),
                  status: response.status(),
                  hash: hash(body),
                };
              } catch (error) {
                return { url: response.url(), error: error.message };
              }
            })(),
          );
        }
      });
      await page.goto(adapter.url ? adapter.url(values.url, mode) : values.url);
      await page.waitForFunction(adapter.ready, undefined, { timeout: 60000 });
      await page.waitForTimeout(warmup);
      await page.evaluate(adapter.start);
      const sample = await page.evaluate(async (duration) => {
        const frames = [],
          start = performance.now();
        let last = start;
        await new Promise((resolve) => {
          function tick(now) {
            frames.push(now - last);
            last = now;
            if (now - start >= duration) resolve();
            else requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        });
        return {
          frames,
          elapsed: performance.now() - start,
          dpr: devicePixelRatio,
          hidden: document.hidden,
          userAgent: navigator.userAgent,
        };
      }, duration);
      const application = await page.evaluate(adapter.stop);
      await page.screenshot({ path: resolve(directory, `${mode}.png`) });
      const runtimeScripts = await Promise.all(scripts);
      const result = benchmarkResult(
        mode,
        sample,
        application,
        errors,
        runtimeScripts,
        target,
      );
      results.push(result);
      // Script hashes remain in the artifact; do not flood interactive output.
      const { runtimeScripts: receipts, ...summary } = result;
      console.log(JSON.stringify({ ...summary, scriptCount: receipts.length }));
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(
  resolve(directory, "benchmark.json"),
  JSON.stringify(
    {
      source,
      build,
      adapterHash,
      metadata,
      browserVersion,
      viewport,
      deviceScaleFactor,
      warmup,
      duration,
      target,
      results,
    },
    null,
    2,
  ) + "\n",
);
if (!passesBenchmark(results)) process.exitCode = 1;
