export function stats(items) {
  if (!items.length) return { count: 0 };
  const sorted = [...items].sort((a, b) => a - b),
    at = (p) =>
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return {
    count: items.length,
    mean: items.reduce((a, b) => a + b, 0) / items.length,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: sorted.at(-1),
  };
}

export function benchmarkResult(
  mode,
  sample,
  application,
  errors,
  runtimeScripts,
  target,
) {
  const { drawDurations = [], ...reported } = application;
  const frameMs = stats(sample.frames),
    fps = (sample.frames.length * 1000) / sample.elapsed;
  return {
    application: reported,
    mode,
    actualMode:
      application.actualMode ??
      application.renderer?.mode ??
      application.mode ??
      null,
    elapsed: sample.elapsed,
    fps,
    frameMs,
    drawMs: stats(drawDurations),
    gpu: application.gpu,
    activityRatio: application.activityRatio,
    dpr: sample.dpr,
    hidden: sample.hidden,
    userAgent: sample.userAgent,
    software: /swiftshader|llvmpipe|software/i.test(application.gpu ?? ""),
    errors,
    runtimeScripts,
    meetsAverageTarget: fps >= target,
    frameBudgetMs: 1000 / target,
    meetsP95Budget: frameMs.p95 <= 1000 / target + 0.5,
  };
}

export function passesBenchmark(results) {
  if (
    !results.length ||
    results.some(
      (r) =>
        r.mode !== r.actualMode ||
        r.errors.length ||
        r.hidden ||
        r.runtimeScripts.some((s) => s.error),
    )
  )
    return false;
  const compat = results.find((r) => r.mode === "webgl");
  return (
    !compat ||
    (!!compat.gpu &&
      !compat.software &&
      compat.meetsAverageTarget &&
      compat.meetsP95Budget &&
      (compat.activityRatio === undefined || compat.activityRatio >= 0.8))
  );
}
