import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/math/mat4.js';
import * as v3 from '../src/math/vec3.js';

const EPS = 1e-5;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < EPS, `${msg ?? ''} expected ${b}, got ${a}`);
const nearVec = (a, b, msg) => a.forEach((x, i) => near(x, b[i], msg));
const deg = (d) => (d * Math.PI) / 180;

test('identity is neutral for multiply', () => {
  const A = M.multiplyAll(M.translate(1, 2, 3), M.rotateY(0.7), M.scale(2, 3, 4));
  nearVec(M.multiply(A, M.identity()), A);
  nearVec(M.multiply(M.identity(), A), A);
});

test('column-major layout: translation sits in elements 12..14', () => {
  const T = M.translate(4, 5, 6);
  assert.deepEqual([T[12], T[13], T[14], T[15]], [4, 5, 6, 1]);
  nearVec(M.transformPoint(T, [1, 1, 1]), [5, 6, 7]);
  nearVec(M.transformDirection(T, [1, 1, 1]), [1, 1, 1], 'directions ignore translation');
});

test('rotations by 90 degrees move the axes as expected (right-handed)', () => {
  nearVec(M.transformPoint(M.rotateX(deg(90)), [0, 1, 0]), [0, 0, 1]);
  nearVec(M.transformPoint(M.rotateY(deg(90)), [0, 0, 1]), [1, 0, 0]);
  nearVec(M.transformPoint(M.rotateZ(deg(90)), [1, 0, 0]), [0, 1, 0]);
});

test('rotations about the same axis add up', () => {
  nearVec(M.multiply(M.rotateZ(0.3), M.rotateZ(0.5)), M.rotateZ(0.8));
});

test('scale and transpose', () => {
  nearVec(M.transformPoint(M.scale(2, 3, 4), [1, 1, 1]), [2, 3, 4]);
  const A = M.multiply(M.translate(1, 2, 3), M.rotateX(0.4));
  nearVec(M.transpose(M.transpose(A)), A);
  assert.equal(M.transpose(A)[3], A[12]);
});

test('invertRigid undoes a rotation + translation', () => {
  const A = M.multiplyAll(M.translate(3, -1, 2), M.rotateY(1.1), M.rotateX(-0.4));
  nearVec(M.multiply(M.invertRigid(A), A), M.identity());
  nearVec(M.multiply(A, M.invertRigid(A)), M.identity());
});

test('T*R*S and S*R*T give different matrices', () => {
  const T = M.translate(1, 0, 0), R = M.rotateZ(deg(90)), S = M.scale(2, 1, 1);
  const trs = M.multiplyAll(T, R, S);
  const srt = M.multiplyAll(S, R, T);
  nearVec(M.transformPoint(trs, [0, 0, 0]), [1, 0, 0]);
  nearVec(M.transformPoint(srt, [0, 0, 0]), [0, 1, 0]);
});

test('normalMatrix keeps normals perpendicular under non-uniform scale', () => {
  const A = M.multiply(M.rotateZ(0.5), M.scale(3, 1, 1));
  const tangent = M.transformDirection(A, [1, -1, 0]);
  const normal = M.transformDirection(M.normalMatrix(A), [1, 1, 0]);
  near(v3.dot(tangent, normal), 0);
});

test('lookAt sends the eye to the origin and the target onto -z', () => {
  const eye = [3, 2, 5], target = [0, 0.5, 0];
  const V = M.lookAt(eye, target, [0, 1, 0]);
  nearVec(M.transformPoint(V, eye), [0, 0, 0]);
  const t = M.transformPoint(V, target);
  near(t[0], 0); near(t[1], 0);
  near(t[2], -v3.length(v3.sub(eye, target)));
  // the rotation part is orthonormal, so invertRigid applies
  nearVec(M.multiply(M.invertRigid(V), V), M.identity());
});

test('lookAt handles up parallel to the view direction', () => {
  const V = M.lookAt([0, 5, 0], [0, 0, 0], [0, 1, 0]);
  for (const x of V) assert.ok(Number.isFinite(x));
  nearVec(M.multiply(M.invertRigid(V), V), M.identity());
  nearVec(M.transformPoint(V, [0, 0, 0]), [0, 0, -5]);
  // looking straight down, world +x should still be screen right
  near(M.transformDirection(V, [1, 0, 0])[0], 1);
});

test('perspective maps near to depth 0 and far to depth 1 (WebGPU)', () => {
  const n = 0.1, f = 20;
  const P = M.perspective(deg(45), 1.5, n, f);
  const zNdc = (z) => { const c = M.transformVec4(P, [0, 0, z, 1]); return c[2] / c[3]; };
  near(zNdc(-n), 0);
  near(zNdc(-f), 1);
  assert.ok(zNdc(-1) > 0 && zNdc(-1) < 1);
  // a point on the top edge of the frustum lands on y_ndc = 1
  const d = 4, c = M.transformVec4(P, [0, d * Math.tan(deg(22.5)), -d, 1]);
  near(c[1] / c[3], 1);
});

test('orthographic uses the same depth range', () => {
  const O = M.orthographic(-2, 2, -1, 1, 0.5, 10);
  near(M.transformPoint(O, [0, 0, -0.5])[2], 0);
  near(M.transformPoint(O, [0, 0, -10])[2], 1);
  nearVec(M.transformPoint(O, [2, 1, -3]).slice(0, 2), [1, 1]);
});
