// Curves in the plane of the painting. Points are 2D arrays [x, y].

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const clamp01 = (t) => Math.min(1, Math.max(0, t));

// ---------- cubic Bézier ----------

// Bernstein basis of degree 3: B0 = (1-t)^3, B1 = 3t(1-t)^2, B2 = 3t^2(1-t), B3 = t^3
export function bernstein(t) {
  const s = 1 - t;
  return [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
}

export function bezier(p0, p1, p2, p3, t) {
  const [b0, b1, b2, b3] = bernstein(t);
  return [
    b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
    b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
  ];
}

// B'(t) = 3 [ (1-t)^2 (P1-P0) + 2t(1-t) (P2-P1) + t^2 (P3-P2) ]
export function bezierTangent(p0, p1, p2, p3, t) {
  const s = 1 - t;
  const a = 3 * s * s, b = 6 * s * t, c = 3 * t * t;
  return [
    a * (p1[0] - p0[0]) + b * (p2[0] - p1[0]) + c * (p3[0] - p2[0]),
    a * (p1[1] - p0[1]) + b * (p2[1] - p1[1]) + c * (p3[1] - p2[1]),
  ];
}

// All intermediate levels of de Casteljau's algorithm.
// levels[0] = control points, levels[last] = [B(t)].
export function deCasteljau(points, t) {
  const levels = [points];
  let cur = points;
  while (cur.length > 1) {
    const next = [];
    for (let i = 0; i < cur.length - 1; i++) next.push(lerp2(cur[i], cur[i + 1], t));
    levels.push(next);
    cur = next;
  }
  return levels;
}

// ---------- piecewise cubic Bézier ----------
// Stored as one array P0 P1 P2 P3 P4 ... P3n. Segment i uses P[3i .. 3i+3], so every
// index divisible by 3 is a knot that lies on the curve, the rest are handles.

export const segmentCount = (points) => Math.floor((points.length - 1) / 3);
export const isKnot = (i) => i % 3 === 0;

export function segmentPoints(points, i) {
  return [points[3 * i], points[3 * i + 1], points[3 * i + 2], points[3 * i + 3]];
}

// Global parameter u in [0, 1] -> (segment index, local t).
function locate(n, u) {
  const s = clamp01(u) * n;
  const i = Math.min(Math.floor(s), n - 1);
  return [i, s - i];
}

export function piecewiseBezier(points, u) {
  const [i, t] = locate(segmentCount(points), u);
  return bezier(...segmentPoints(points, i), t);
}

export function piecewiseBezierTangent(points, u) {
  const [i, t] = locate(segmentCount(points), u);
  return bezierTangent(...segmentPoints(points, i), t);
}

// C1 at the joint P3k needs  P3k - P3k-1 = P3k+1 - P3k,  i.e. the two handles are
// mirror images through the knot. `moved` is the index the user just dragged; the
// handle on the other side of the joint follows it. With moved = -1 every joint is
// fixed by keeping the incoming handle and mirroring the outgoing one.
export function enforceC1(points, moved = -1) {
  const last = points.length - 1;
  for (let k = 3; k < last; k += 3) {
    const K = points[k];
    if (moved === k + 1) {
      points[k - 1] = [2 * K[0] - points[k + 1][0], 2 * K[1] - points[k + 1][1]];
    } else {
      points[k + 1] = [2 * K[0] - points[k - 1][0], 2 * K[1] - points[k - 1][1]];
    }
  }
  return points;
}

// ---------- Catmull–Rom (uniform) ----------
// Interpolates the points. Segment i goes from P_i to P_i+1 and uses P_i-1 .. P_i+2.
// The end segments use a reflected ghost point, e.g. P_-1 = 2 P_0 - P_1.

export function catmullRomSegment(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

export function catmullRomSegmentTangent(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const f = (a, b, c, d) =>
    0.5 * ((-a + c) + 2 * (2 * a - 5 * b + 4 * c - d) * t + 3 * (-a + 3 * b - 3 * c + d) * t2);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

function crNeighbours(points, i) {
  const n = points.length;
  const get = (k) => {
    if (k < 0) return lerp2(points[0], points[1], -1);              // 2 P0 - P1
    if (k > n - 1) return lerp2(points[n - 1], points[n - 2], -1);   // 2 Pn-1 - Pn-2
    return points[k];
  };
  return [get(i - 1), get(i), get(i + 1), get(i + 2)];
}

export function catmullRom(points, u) {
  const [i, t] = locate(points.length - 1, u);
  return catmullRomSegment(...crNeighbours(points, i), t);
}

export function catmullRomTangent(points, u) {
  const [i, t] = locate(points.length - 1, u);
  return catmullRomSegmentTangent(...crNeighbours(points, i), t);
}

// Same segment written as a cubic Bézier: handles are P_i + (P_i+1 - P_i-1)/6 and
// P_i+1 - (P_i+2 - P_i)/6. Used to show that the two forms agree.
export function catmullRomToBezier(p0, p1, p2, p3) {
  return [
    p1,
    [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
    [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
    p2,
  ];
}

// ---------- arc length ----------
// Table of (u, distance) so an object can move along the curve at constant speed
// instead of speeding up where the control points are far apart.

export function arcLengthTable(evaluate, samples = 256) {
  const us = [0], ds = [0];
  let prev = evaluate(0), total = 0;
  for (let k = 1; k <= samples; k++) {
    const u = k / samples;
    const p = evaluate(u);
    total += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    us.push(u);
    ds.push(total);
    prev = p;
  }
  return { us, ds, total };
}

// Distance along the curve (0..total) -> parameter u, by binary search + lerp.
export function paramAtDistance(table, d) {
  const { us, ds, total } = table;
  if (total === 0) return 0;
  d = Math.min(Math.max(d, 0), total);
  let lo = 0, hi = ds.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ds[mid] < d) lo = mid; else hi = mid;
  }
  const span = ds[hi] - ds[lo];
  const f = span > 0 ? (d - ds[lo]) / span : 0;
  return us[lo] + (us[hi] - us[lo]) * f;
}
