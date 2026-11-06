import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/math/mat4.js';
import { OrbitCamera } from '../src/scene/camera.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-4, `expected ${b}, got ${a}`);

function cornersToNdc(cam, aspect) {
  const VP = cam.viewProjection(aspect);
  return cam.frustumCorners(aspect).map((p) => {
    const c = M.transformVec4(VP, [...p, 1]);
    return [c[0] / c[3], c[1] / c[3], c[2] / c[3]];
  });
}

// corners are ordered bottom-left, bottom-right, top-right, top-left; near first, then far
const expected = [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];

test('frustum corners land on the NDC cube corners (perspective)', () => {
  const cam = new OrbitCamera({ near: 0.2, far: 15 });
  cornersToNdc(cam, 1.6).forEach((p, i) => p.forEach((x, k) => near(x, expected[i][k])));
});

test('frustum corners land on the NDC cube corners (orthographic)', () => {
  const cam = new OrbitCamera({ projection: 'orthographic', near: 0.5, far: 9 });
  cornersToNdc(cam, 0.8).forEach((p, i) => p.forEach((x, k) => near(x, expected[i][k])));
});

test('a ray through the screen centre hits the target', () => {
  for (const projection of ['perspective', 'orthographic']) {
    const cam = new OrbitCamera({ projection });
    const { origin, dir } = cam.ray(0, 0, 1.5);
    const t = cam.distance;
    [0, 1, 2].forEach((k) => near(origin[k] + dir[k] * t, cam.target[k]));
  }
});
