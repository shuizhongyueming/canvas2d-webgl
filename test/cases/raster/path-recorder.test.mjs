import test from "node:test";
import assert from "node:assert/strict";
import { PathRecorder } from "../../../dist/path/recorder.js";

const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);
const MOVED = Object.freeze([1, 0, 0, 1, 10, 20]);

test("commands capture the construction-time transform as a frozen copy", () => {
  const recorder = new PathRecorder();
  const mutable = [1, 0, 0, 1, 5, 6];
  recorder.moveTo(1, 2, mutable);
  recorder.lineTo(3, 4, MOVED);
  mutable[4] = 999;
  const [first, second] = recorder.snapshot().commands;
  assert.deepEqual(first.transform, [1, 0, 0, 1, 5, 6]);
  assert.deepEqual(second.transform, [...MOVED]);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.args));
  assert.ok(Object.isFrozen(first.transform));
});

test("snapshots are immutable and unaffected by later mutations or begin()", () => {
  const recorder = new PathRecorder();
  recorder.moveTo(1, 1, IDENTITY);
  const before = recorder.snapshot();
  recorder.lineTo(2, 2, IDENTITY);
  assert.equal(before.commands.length, 1);
  recorder.begin();
  assert.equal(before.commands.length, 1);
  assert.throws(() => {
    before.commands.push({ op: "closePath", args: [], transform: IDENTITY });
  }, TypeError);
});

test("ids stay stable without mutation and change on append, begin and reset", () => {
  const recorder = new PathRecorder();
  recorder.moveTo(0, 0, IDENTITY);
  const a = recorder.snapshot();
  const b = recorder.snapshot();
  assert.equal(a.id, b.id);
  recorder.lineTo(1, 1, IDENTITY);
  assert.notEqual(recorder.snapshot().id, a.id);
  recorder.begin();
  const afterBegin = recorder.snapshot();
  assert.notEqual(afterBegin.id, a.id);
  assert.equal(afterBegin.commands.length, 0);
  recorder.moveTo(3, 3, IDENTITY);
  recorder.reset();
  assert.equal(recorder.snapshot().commands.length, 0);
});

test("negative radii raise IndexSizeError matching the native shape", () => {
  const recorder = new PathRecorder();
  for (const call of [
    () => recorder.arc(0, 0, -1, 0, 6, false, IDENTITY),
    () => recorder.arcTo(0, 0, 1, 1, -2, IDENTITY),
    () => recorder.ellipse(0, 0, -1, 2, 0, 0, 6, false, IDENTITY),
    () => recorder.ellipse(0, 0, 1, -2, 0, 0, 6, false, IDENTITY),
  ]) {
    assert.throws(call, (error) => {
      assert.equal(error.name, "IndexSizeError");
      assert.equal(error.code, 1);
      assert.ok(error instanceof DOMException);
      assert.match(error.message, /negative/);
      return true;
    });
  }
  assert.equal(recorder.snapshot().commands.length, 0);
});

test("non-finite input is silently ignored before any radius check", () => {
  const recorder = new PathRecorder();
  recorder.moveTo(NaN, 0, IDENTITY);
  recorder.lineTo(1, Infinity, IDENTITY);
  recorder.rect(0, 0, NaN, 1, IDENTITY);
  recorder.quadraticCurveTo(0, 0, 1, -Infinity, IDENTITY);
  recorder.arc(0, 0, NaN, 0, 6, false, IDENTITY);
  // The finite check runs first: no throw despite the negative radius.
  recorder.arc(NaN, 0, -1, 0, 6, false, IDENTITY);
  recorder.arcTo(0, 0, Infinity, 1, -1, IDENTITY);
  recorder.ellipse(0, 0, NaN, -1, 0, 0, 6, false, IDENTITY);
  assert.equal(recorder.snapshot().commands.length, 0);
  recorder.moveTo(1, 1, IDENTITY);
  assert.equal(recorder.snapshot().commands.length, 1);
});

test("append() stores a defensive copy and rejects malformed commands", () => {
  const recorder = new PathRecorder();
  const args = [1, 2];
  const transform = [2, 0, 0, 2, 0, 0];
  recorder.append({ op: "moveTo", args, transform });
  args[0] = 99;
  transform[4] = 99;
  const [command] = recorder.snapshot().commands;
  assert.deepEqual(command.args, [1, 2]);
  assert.deepEqual(command.transform, [2, 0, 0, 2, 0, 0]);
  assert.throws(
    () => recorder.append({ op: "bezierCurveTo", args: [1, 2], transform }),
    TypeError,
  );
  assert.throws(
    () => recorder.append({ op: "moveTo", args: [1], transform }),
    TypeError,
  );
});

test("arc and ellipse record the anticlockwise flag verbatim", () => {
  const recorder = new PathRecorder();
  recorder.arc(1, 2, 3, 0, Math.PI, true, IDENTITY);
  recorder.ellipse(1, 2, 3, 4, 0.5, 0, Math.PI, false, IDENTITY);
  const [arc, ellipse] = recorder.snapshot().commands;
  assert.deepEqual(arc.args, [1, 2, 3, 0, Math.PI, true]);
  assert.deepEqual(ellipse.args, [1, 2, 3, 4, 0.5, 0, Math.PI, false]);
});
