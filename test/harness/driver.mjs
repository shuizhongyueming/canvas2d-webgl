import { chromium } from "playwright";
// Isolated CI driver; no user profile, browser extension, or persistent session.
// An explicitly requested software backend is recorded, never a fallback retry.
export async function launchDriver({
  executable,
  software = false,
  disableGPU = false,
} = {}) {
  const args = software
    ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    : [];
  if (disableGPU) args.push("--disable-webgl");
  const browser = await chromium.launch({
    headless: true,
    executablePath: executable,
    args,
  });
  return {
    version: browser.version(),
    configuration: {
      driver: "playwright",
      headless: true,
      softwareRequested: software,
      executable: executable || "playwright-chromium",
    },
    async page(url) {
      const context = await browser.newContext({
        viewport: { width: 1200, height: 900 },
        deviceScaleFactor: 1,
        colorScheme: "light",
        locale: "en-US",
        timezoneId: "UTC",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      await page.goto(url);
      return {
        async evaluate(fn, arg) {
          let timer;
          try {
            return await Promise.race([
              page.evaluate(fn, arg),
              new Promise((_, reject) => {
                timer = setTimeout(
                  () => reject(Error("Browser evaluation timed out")),
                  30000,
                );
              }),
            ]);
          } finally {
            clearTimeout(timer);
          }
        },
        screenshot: () =>
          page
            .locator("#target")
            .screenshot({ animations: "allow", scale: "css", timeout: 10000 }),
        close: () => context.close(),
      };
    },
    close: () => browser.close(),
  };
}
