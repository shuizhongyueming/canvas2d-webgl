// #71 的本地服务。只绑定回环地址；目录来自完整 catalog 的真实投影。
import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { loadCatalog } from "../test/harness/catalog.mjs";
import { projectDisplayCatalog } from "../dist/live/catalog/display-catalog.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

export function localPage() {
  return '<!doctype html><meta charset="utf-8"><title>Canvas live comparison</title><div id="app"></div><script type="module" src="/dist/live/controller/page.js"></script>';
}

export function runnerPage() {
  return '<!doctype html><meta charset="utf-8"><title>Canvas live runner</title><style>html,body{margin:0;background:transparent}canvas{display:block}</style><script type="module">import {startRunnerDocument} from "/dist/live/controller/runner-document.js";startRunnerDocument(window);</script>';
}

export async function createLiveServer({
  root,
  port = 0,
  load = loadCatalog,
} = {}) {
  if (!root) throw new Error("live-server: root is required");
  const base = await realpath(root);
  const definitions = await load(base);
  const catalog = projectDisplayCatalog(definitions);
  const modules = new Map(definitions.map((entry) => [entry.id, entry.module]));
  const entries = catalog.map((entry) => ({
    ...entry,
    caseModuleUrl: modules.get(entry.id),
  }));
  const server = createServer(async (req, res) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { Allow: "GET, HEAD" }).end();
        return;
      }
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/api/catalog") {
        res.writeHead(200, {
          "Content-Type": MIME[".json"],
          "Cache-Control": "no-store",
        });
        res.end(req.method === "HEAD" ? undefined : JSON.stringify(entries));
        return;
      }
      if (url.pathname === "/" || url.pathname === "/index.html") {
        res.writeHead(200, { "Content-Type": MIME[".html"] });
        res.end(req.method === "HEAD" ? undefined : localPage());
        return;
      }
      if (url.pathname === "/runner.html") {
        res.writeHead(200, { "Content-Type": MIME[".html"] });
        res.end(req.method === "HEAD" ? undefined : runnerPage());
        return;
      }
      const name = decodeURIComponent(url.pathname);
      if (
        !/^\/(dist|test|\.build)\//.test(name) ||
        /\.(?:ts|map)$/i.test(name)
      ) {
        res.writeHead(404).end();
        return;
      }
      const path = await realpath(resolve(base, `.${name}`));
      if (
        !["dist", "test", ".build"].some((dir) =>
          path.startsWith(resolve(base, dir) + sep),
        )
      )
        throw new Error("Outside served directories");
      res.writeHead(200, {
        "Content-Type": MIME[extname(path)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(req.method === "HEAD" ? undefined : await readFile(path));
    } catch {
      if (!res.headersSent) res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("live-server: unavailable address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    catalog: entries,
    close: () =>
      new Promise((resolveClose, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolveClose()));
      }),
  };
}
