/** Capture the thrown error (assert.throws does not return it). */
export function capture(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
}
