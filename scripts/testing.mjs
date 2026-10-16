// Protocol reservation only. Issue 11 owns the real browser/report/acceptance drivers.
const stage = process.argv[2];
if (!['browser', 'report', 'acceptance'].includes(stage)) {
  console.error('Expected browser, report or acceptance');
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    schemaVersion: 1,
    stage,
    execution: 'blocked',
    reason: 'driver-not-implemented',
    implementationIssue: 'https://github.com/shuizhongyueming/canvas2d-webgl/issues/11',
  }));
  process.exitCode = 2;
}
