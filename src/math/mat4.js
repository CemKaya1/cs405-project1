// 4x4 matrices, column-major, in a Float32Array(16).
// Entry (row r, column c) lives at m[c * 4 + r]. This is exactly how WGSL reads a
// mat4x4f from a uniform buffer, so matrices are uploaded without transposing.
//
// Convention used everywhere in the project: column vectors, p' = M * p.
// So in M = T * R * S the scale is applied first and the translation last.

import * as v3 from './vec3.js';

export function create() {
  return new Float32Array(16);
}

export function identity() {
  const m = create();
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function clone(m) {
  return new Float32Array(m);
}

// a * b
export function multiply(a, b) {
  const out = create();
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

// multiplyAll(A, B, C) = A * B * C
export function multiplyAll(...ms) {
  return ms.reduce((acc, m) => multiply(acc, m));
}

export function translate(x, y, z) {
  const m = identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function scale(x, y, z = x) {
  const m = identity();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}

export function rotateX(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const m = identity();
  m[5] = c; m[6] = s;    // column 1 = (0, c, s)
  m[9] = -s; m[10] = c;  // column 2 = (0, -s, c)
  return m;
}

export function rotateY(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const m = identity();
  m[0] = c; m[2] = -s;   // column 0 = (c, 0, -s)
  m[8] = s; m[10] = c;   // column 2 = (s, 0, c)
  return m;
}

export function rotateZ(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const m = identity();
  m[0] = c; m[1] = s;    // column 0 = (c, s, 0)
  m[4] = -s; m[5] = c;   // column 1 = (-s, c, 0)
  return m;
}

export function rotate(axis, angle) {
  if (axis === 'x') return rotateX(angle);
  if (axis === 'y') return rotateY(angle);
  return rotateZ(angle);
}

export function transpose(m) {
  const out = create();
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) out[r * 4 + c] = m[c * 4 + r];
  }
  return out;
}

// Inverse of a rigid transform M = [R t; 0 1]  ->  M^-1 = [R^T  -R^T t; 0 1].
// Only valid when the upper 3x3 is a pure rotation (no scale, no shear).
export function invertRigid(m) {
  const out = identity();
  // R^T
  out[0] = m[0]; out[4] = m[1]; out[8] = m[2];
  out[1] = m[4]; out[5] = m[5]; out[9] = m[6];
  out[2] = m[8]; out[6] = m[9]; out[10] = m[10];
  // -R^T t
  const tx = m[12], ty = m[13], tz = m[14];
  out[12] = -(out[0] * tx + out[4] * ty + out[8] * tz);
  out[13] = -(out[1] * tx + out[5] * ty + out[9] * tz);
  out[14] = -(out[2] * tx + out[6] * ty + out[10] * tz);
  return out;
}

// Matrix for transforming normals: inverse-transpose of the upper 3x3, padded to 4x4.
// For columns a, b, c of the 3x3, the inverse-transpose has columns
// (b x c, c x a, a x b) / det.
export function normalMatrix(m) {
  const a = [m[0], m[1], m[2]];
  const b = [m[4], m[5], m[6]];
  const c = [m[8], m[9], m[10]];
  const bc = v3.cross(b, c), ca = v3.cross(c, a), ab = v3.cross(a, b);
  const det = v3.dot(a, bc);
  const inv = Math.abs(det) < 1e-12 ? 0 : 1 / det;
  const out = identity();
  out[0] = bc[0] * inv; out[1] = bc[1] * inv; out[2] = bc[2] * inv;
  out[4] = ca[0] * inv; out[5] = ca[1] * inv; out[6] = ca[2] * inv;
  out[8] = ab[0] * inv; out[9] = ab[1] * inv; out[10] = ab[2] * inv;
  return out;
}

// Build a matrix whose columns are the given axes and origin.
export function fromBasis(x, y, z, origin) {
  const m = identity();
  m.set(x, 0);
  m.set(y, 4);
  m.set(z, 8);
  m.set(origin, 12);
  return m;
}

// M * (x, y, z, w)
export function transformVec4(m, v) {
  const [x, y, z, w] = v;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    m[2] * x + m[6] * y + m[10] * z + m[14] * w,
    m[3] * x + m[7] * y + m[11] * z + m[15] * w,
  ];
}

export function transformPoint(m, p) {
  const r = transformVec4(m, [p[0], p[1], p[2], 1]);
  return [r[0], r[1], r[2]];
}

export function transformDirection(m, d) {
  const r = transformVec4(m, [d[0], d[1], d[2], 0]);
  return [r[0], r[1], r[2]];
}

export function getColumn(m, c) {
  return [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]];
}

// View matrix. The camera sits at `eye`, looks at `target`, and (as in OpenGL and
// WebGPU's usual setup) looks down its own -z axis.
//   w = normalize(eye - target)     camera z (points backwards)
//   u = normalize(up x w)           camera x (right)
//   v = w x u                       camera y (true up)
// The view matrix is the inverse of the camera's rigid frame [u v w eye].
export function lookAt(eye, target, up = [0, 1, 0]) {
  const w = v3.normalize(v3.sub(eye, target));
  let u = v3.cross(up, w);
  if (v3.length(u) < 1e-6) {
    // up is parallel to the view direction, so up x w = 0 and the camera has no
    // well-defined "right". Pick another up: when looking straight down (or up) use
    // the world z axis so that world x still points right on screen, otherwise world y.
    const alt = Math.abs(w[1]) > 0.5 ? [0, 0, -Math.sign(w[1])] : [0, 1, 0];
    u = v3.cross(alt, w);
  }
  u = v3.normalize(u);
  const v = v3.cross(w, u);

  const m = identity();
  m[0] = u[0]; m[4] = u[1]; m[8] = u[2];
  m[1] = v[0]; m[5] = v[1]; m[9] = v[2];
  m[2] = w[0]; m[6] = w[1]; m[10] = w[2];
  m[12] = -v3.dot(u, eye);
  m[13] = -v3.dot(v, eye);
  m[14] = -v3.dot(w, eye);
  return m;
}

// Perspective projection for WebGPU: clip-space depth z/w goes from 0 (near) to 1 (far).
// OpenGL's version maps to [-1, 1]; the two differ only in the third row.
//   z_clip = A z + B,  w_clip = -z
//   z = -near -> 0  and  z = -far -> 1   gives  A = far / (near - far),  B = near * far / (near - far)
export function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const m = create();
  m[0] = f / aspect;
  m[5] = f;
  m[10] = far / (near - far);
  m[11] = -1;
  m[14] = (near * far) / (near - far);
  return m;
}

// Orthographic projection with the same depth convention: z = -near -> 0, z = -far -> 1.
export function orthographic(left, right, bottom, top, near, far) {
  const m = identity();
  m[0] = 2 / (right - left);
  m[5] = 2 / (top - bottom);
  m[10] = 1 / (near - far);
  m[12] = -(right + left) / (right - left);
  m[13] = -(top + bottom) / (top - bottom);
  m[14] = near / (near - far);
  return m;
}

// Rows of the matrix as text, for the on-screen panels.
export function format(m, digits = 2) {
  const width = digits + 5;
  const lines = [];
  for (let r = 0; r < 4; r++) {
    let line = '';
    for (let c = 0; c < 4; c++) {
      let v = m[c * 4 + r];
      if (Math.abs(v) < 0.5 * 10 ** -digits) v = 0;
      line += v.toFixed(digits).padStart(width);
    }
    lines.push(line);
  }
  return lines.join('\n');
}
