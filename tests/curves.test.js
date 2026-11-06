import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/math/curves.js';

const EPS = 1e-9;
const near = (a, b) => assert.ok(Math.abs(a - b) < EPS, `expected ${b}, got ${a}`);
const nearVec = (a, b) => a.forEach((x, i) => near(x, b[i]));

const P = [[0, 0], [1, 2], [3, 3], [4, 0]];

test('Bernstein basis sums to one', () => {
  for (let t = 0; t <= 1; t += 0.125) near(C.bernstein(t).reduce((a, b) => a + b), 1);
});

test('Bézier starts at P0 and ends at P3', () => {
  nearVec(C.bezier(...P, 0), P[0]);
  nearVec(C.bezier(...P, 1), P[3]);
});

test('end tangents are 3(P1 - P0) and 3(P3 - P2)', () => {
  nearVec(C.bezierTangent(...P, 0), [3, 6]);
  nearVec(C.bezierTangent(...P, 1), [3, -9]);
});

test('de Casteljau gives the same point as the Bernstein form', () => {
  for (const t of [0, 0.2, 0.5, 0.77, 1]) {
    const levels = C.deCasteljau(P, t);
    assert.equal(levels.length, 4);
    nearVec(levels[3][0], C.bezier(...P, t));
  }
});

test('enforceC1 mirrors the handles at every interior knot', () => {
  const pts = [[0, 0], [1, 1], [2, 1], [3, 0], [9, 9], [5, -1], [6, 0], [0, 0], [8, 1], [9, 0]];
  C.enforceC1(pts);
  for (const k of [3, 6]) {
    const left = C.bezierTangent(...C.segmentPoints(pts, k / 3 - 1), 1);
    const right = C.bezierTangent(...C.segmentPoints(pts, k / 3), 0);
    nearVec(left, right);
  }
  // dragging an outgoing handle moves the incoming one instead
  pts[4] = [4, 1];
  C.enforceC1(pts, 4);
  nearVec(pts[2], [2, -1]);
});

test('piecewise evaluation is continuous at the joints', () => {
  const pts = C.enforceC1([[0, 0], [1, 1], [2, 1], [3, 0], [0, 0], [5, -1], [6, 0], [0, 0], [8, 1], [9, 0]]);
  nearVec(C.piecewiseBezier(pts, 1 / 3), pts[3]);
  nearVec(C.piecewiseBezier(pts, 2 / 3), pts[6]);
  nearVec(C.piecewiseBezier(pts, 1), pts[9]);
});

test('Catmull–Rom passes through its points with tangent (P[i+1] - P[i-1]) / 2', () => {
  const pts = [[0, 0], [1, 2], [3, 3], [4, 0], [6, 1]];
  const n = pts.length - 1;
  pts.forEach((p, i) => nearVec(C.catmullRom(pts, i / n), p));
  nearVec(C.catmullRomTangent(pts, 2 / n), [(pts[3][0] - pts[1][0]) / 2, (pts[3][1] - pts[1][1]) / 2]);
});

test('a Catmull–Rom segment equals its Bézier form', () => {
  const q = [[0, 0], [1, 2], [3, 3], [4, 0]];
  const b = C.catmullRomToBezier(...q);
  for (const t of [0, 0.3, 0.6, 1]) nearVec(C.catmullRomSegment(...q, t), C.bezier(...b, t));
});

test('arc length table inverts distance to parameter', () => {
  const line = (u) => [4 * u * u, 0]; // non-uniform speed on a straight line
  const table = C.arcLengthTable(line, 1000);
  assert.ok(Math.abs(table.total - 4) < 1e-6);
  const u = C.paramAtDistance(table, 1);
  assert.ok(Math.abs(line(u)[0] - 1) < 1e-3);
});
