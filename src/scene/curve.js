import * as C from '../math/curves.js';

// Outline of the whole melon in Kavunlu Natürmort, measured on the 720 x 502 image
// (pixels, y down): from the bottom of the cut face, over the top of the rind, down the
// right end. Knots are every third point. Only used if public/curve.json can't be loaded.
const FALLBACK_PIXELS = [
  [174, 262], [156, 215], [160, 150],
  [203, 114], [246, 78], [330, 56],
  [400, 56], [470, 56], [570, 92],
  [603, 138], [636, 184], [650, 260],
  [618, 290],
];

export const CURVE_TYPES = {
  bezier: 'Piecewise cubic Bézier (C1)',
  catmullRom: 'Catmull–Rom spline',
};

// A curve living in the painting's plane. Points are stored in painting-local units
// (the quad spans [-w/2, w/2] x [-h/2, h/2]); JSON uses normalised [0, 1] coordinates.
export class TracedCurve {
  constructor(paintingWidth, paintingHeight) {
    this.width = paintingWidth;
    this.height = paintingHeight;
    this.type = 'bezier';
    this.points = [];
    this.saved = null;
  }

  fromNormalized(x, y) {
    return [(x - 0.5) * this.width, (y - 0.5) * this.height];
  }

  toNormalized(p) {
    return [p[0] / this.width + 0.5, p[1] / this.height + 0.5];
  }

  loadFallback(imageWidth, imageHeight) {
    this.load({
      type: 'bezier',
      points: FALLBACK_PIXELS.map(([x, y]) => ({ x: x / imageWidth, y: 1 - y / imageHeight })),
    });
  }

  load(json) {
    const pts = json.points.map((p) => this.fromNormalized(p.x, p.y));
    if (pts.length < 10 || (pts.length - 1) % 3 !== 0) throw new Error('curve.json needs 3n+1 points, n >= 3');
    this.points = C.enforceC1(pts);
    if (json.type in CURVE_TYPES) this.type = json.type;
    this.saved = JSON.parse(JSON.stringify(json));
    this.changed();
  }

  reset() {
    if (this.saved) this.load(this.saved);
  }

  changed() {
    this.table = C.arcLengthTable((u) => this.evaluate(u), 400);
  }

  get segments() {
    return C.segmentCount(this.points);
  }

  // Catmull–Rom goes through the knots of the Bézier, so both curve types share one
  // set of points and the user can switch between them while tracing.
  knots() {
    return this.points.filter((_, i) => C.isKnot(i));
  }

  evaluate(u) {
    return this.type === 'bezier' ? C.piecewiseBezier(this.points, u) : C.catmullRom(this.knots(), u);
  }

  tangent(u) {
    return this.type === 'bezier' ? C.piecewiseBezierTangent(this.points, u) : C.catmullRomTangent(this.knots(), u);
  }

  sample(count) {
    const out = [];
    for (let k = 0; k <= count; k++) out.push(this.evaluate(k / count));
    return out;
  }

  // Parameter after travelling distance d along the curve (for constant-speed motion).
  paramAt(d) {
    return C.paramAtDistance(this.table, d);
  }

  // Indices the user may drag: everything for Bézier, only the knots for Catmull–Rom.
  editable(i) {
    return this.type === 'bezier' || C.isKnot(i);
  }

  move(i, p) {
    const old = this.points[i];
    if (C.isKnot(i)) {
      // A knot carries its handles with it, which keeps the joint C1.
      const dx = p[0] - old[0], dy = p[1] - old[1];
      for (const j of [i - 1, i + 1]) {
        if (j >= 0 && j < this.points.length) this.points[j] = [this.points[j][0] + dx, this.points[j][1] + dy];
      }
      this.points[i] = [p[0], p[1]];
    } else {
      this.points[i] = [p[0], p[1]];
      C.enforceC1(this.points, i);
    }
    this.changed();
  }

  // New segment ending at p. Its first handle mirrors the previous one (C1); the
  // second sits a third of the way back towards the old end.
  append(p) {
    const n = this.points.length;
    const end = this.points[n - 1], prev = this.points[n - 2];
    const h1 = [2 * end[0] - prev[0], 2 * end[1] - prev[1]];
    const h2 = [p[0] + (end[0] - p[0]) / 3, p[1] + (end[1] - p[1]) / 3];
    this.points.push(h1, h2, [p[0], p[1]]);
    this.changed();
  }

  removeLast() {
    if (this.segments <= 3) return false;
    this.points.splice(-3, 3);
    this.changed();
    return true;
  }

  toJSON(painting) {
    const round = (x) => Math.round(x * 10000) / 10000;
    return {
      painting: painting.title,
      artist: painting.artist,
      coordinates: 'normalised to the painting: (0,0) bottom-left, (1,1) top-right',
      type: this.type,
      continuity: this.type === 'bezier' ? 'C1 (handles mirrored at every joint)' : 'C1 (Catmull-Rom)',
      segments: this.type === 'bezier' ? this.segments : this.knots().length - 1,
      points: this.points.map((p, i) => {
        const [x, y] = this.toNormalized(p);
        return { x: round(x), y: round(y), role: C.isKnot(i) ? 'knot' : 'handle' };
      }),
    };
  }
}
