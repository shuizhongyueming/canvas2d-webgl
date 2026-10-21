import { createCompatError, ERROR_CODES } from "../contracts/errors.js";

/** Compile and link a program, deleting partial objects on any failure. */
export function compileProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw createCompatError(
      ERROR_CODES.INITIALIZATION,
      "program creation failed",
    );
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "unknown";
    gl.deleteProgram(program);
    throw createCompatError(
      ERROR_CODES.INITIALIZATION,
      `program link failed: ${log}`,
    );
  }
  return program;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader)
    throw createCompatError(
      ERROR_CODES.INITIALIZATION,
      "shader creation failed",
    );
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown";
    gl.deleteShader(shader);
    throw createCompatError(
      ERROR_CODES.INITIALIZATION,
      `shader compile failed: ${log}`,
    );
  }
  return shader;
}
