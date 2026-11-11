import test from "node:test";
import assert from "node:assert/strict";
import { TextureCache } from "../../../dist/gpu/texture-cache.js";

function fixture() {
  let uploads = 0;
  let created = 0;
  const deleted = [];
  const gl = {
    NO_ERROR: 0,
    TEXTURE0: 0,
    TEXTURE_2D: 1,
    TEXTURE_MIN_FILTER: 2,
    TEXTURE_MAG_FILTER: 3,
    NEAREST: 4,
    getError: () => 0,
    activeTexture() {},
    createTexture: () => ({ id: ++created }),
    bindTexture() {},
    pixelStorei() {},
    texParameteri() {},
    texImage2D() {
      uploads += 1;
    },
    deleteTexture(texture) {
      deleted.push(texture);
    },
  };
  const source = (width, height) => {
    const canvas = { width, height };
    return {
      kind: "raster",
      canvas,
      bounds: { x: 0, y: 0, width, height },
      pixelWidth: width,
      pixelHeight: height,
    };
  };
  return {
    gl,
    source,
    deleted,
    uploads: () => uploads,
  };
}

test("immutable raster texture survives source bitmap release", () => {
  const { gl, source, uploads } = fixture();
  const cache = new TextureCache(gl, 16);
  const raster = source(4, 4);
  const first = cache.acquire(raster);
  raster.canvas.width = raster.canvas.height = 0;
  const second = cache.acquire(raster);
  assert.equal(second.texture, first.texture);
  assert.equal(second.retained, true);
  assert.equal(uploads(), 1);
  cache.clear();
});

test("capacity fallback evicts the older texture and stays bounded", () => {
  const { gl, source, uploads, deleted } = fixture();
  const cache = new TextureCache(gl, 16, 1, 16);
  const first = cache.acquire(source(2, 2));
  const second = cache.acquire(source(3, 3));
  assert.equal(first.retained, true);
  assert.equal(second.retained, true);
  assert.equal(uploads(), 2);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0], first.texture);
  cache.clear();
  assert.equal(deleted.length, 2);
});

test("oversize raster upload does not occupy the cache", () => {
  const { gl, source, uploads, deleted } = fixture();
  const cache = new TextureCache(gl, 16, 1, 4);
  const texture = cache.acquire(source(4, 4));
  assert.equal(texture.retained, false);
  assert.equal(uploads(), 1);
  cache.clear();
  assert.equal(deleted.length, 0);
  gl.deleteTexture(texture.texture);
});

test("clear releases each retained texture exactly once", () => {
  const { gl, source, deleted } = fixture();
  const cache = new TextureCache(gl, 16);
  cache.acquire(source(2, 2));
  cache.acquire(source(3, 3));
  cache.clear();
  cache.clear();
  assert.equal(deleted.length, 2);
});
