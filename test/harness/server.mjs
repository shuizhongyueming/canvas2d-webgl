import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
export async function serve(root) {
  const base = await realpath(root);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/") {
        res.setHeader("Content-Type", "text/html");
        res.end(
          '<!doctype html><meta charset="utf-8"><title>Canvas test harness</title><style>html,body{margin:0;background:white}canvas{display:block}</style>',
        );
        return;
      }
      const name = decodeURIComponent(url.pathname);
      if (!/^\/(src|test)\//.test(name)) {
        res.writeHead(404).end();
        return;
      }
      const path = await realpath(resolve(base, "." + name));
      if (
        !["src", "test"].some((dir) =>
          path.startsWith(resolve(base, dir) + sep),
        )
      )
        throw Error("Outside served directories");
      res.setHeader(
        "Content-Type",
        {
          ".js": "text/javascript",
          ".mjs": "text/javascript",
          ".png": "image/png",
          ".woff2": "font/woff2",
          ".json": "application/json",
        }[extname(path)] || "application/octet-stream",
      );
      res.setHeader("Cache-Control", "no-store");
      res.end(await readFile(path));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((yes, no) => {
    server.once("error", no);
    server.listen(0, "127.0.0.1", yes);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((yes, no) => server.close((e) => (e ? no(e) : yes()))),
  };
}
