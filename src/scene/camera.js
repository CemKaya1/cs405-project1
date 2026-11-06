import * as M from '../math/mat4.js';
import * as v3 from '../math/vec3.js';

const DEG = Math.PI / 180;
const PITCH_LIMIT = 89 * DEG;

// Camera that orbits a target on a sphere (yaw around world y, pitch above the horizon).
export class OrbitCamera {
  constructor(settings = {}) {
    this.defaults = {
      target: [0, -0.35, 0.4],
      distance: 5.2,
      yaw: 18 * DEG,
      pitch: 10 * DEG,
      fov: 45,          // vertical, degrees (easier to show in the UI)
      near: 0.1,
      far: 30,
      projection: 'perspective',
      ...settings,
    };
    this.up = [0, 1, 0];
    this.reset();
  }

  reset() {
    const d = this.defaults;
    this.target = [...d.target];
    this.distance = d.distance;
    this.yaw = d.yaw;
    this.pitch = d.pitch;
    this.fov = d.fov;
    this.near = d.near;
    this.far = d.far;
    this.projection = d.projection;
  }

  get eye() {
    const cp = Math.cos(this.pitch);
    return [
      this.target[0] + this.distance * cp * Math.sin(this.yaw),
      this.target[1] + this.distance * Math.sin(this.pitch),
      this.target[2] + this.distance * cp * Math.cos(this.yaw),
    ];
  }

  // True when the up vector is parallel to the view direction, i.e. lookAt has to
  // use its fallback (only happens with the "top view" button).
  get degenerate() {
    const w = v3.normalize(v3.sub(this.eye, this.target));
    return v3.length(v3.cross(this.up, w)) < 1e-6;
  }

  viewMatrix() {
    return M.lookAt(this.eye, this.target, this.up);
  }

  // Half height of the visible region at the target distance. The orthographic camera
  // uses this so that switching projection keeps the target at the same size.
  halfHeight() {
    return this.distance * Math.tan((this.fov * DEG) / 2);
  }

  projectionMatrix(aspect) {
    if (this.projection === 'perspective') {
      return M.perspective(this.fov * DEG, aspect, this.near, this.far);
    }
    const h = this.halfHeight();
    return M.orthographic(-h * aspect, h * aspect, -h, h, this.near, this.far);
  }

  viewProjection(aspect) {
    return M.multiply(this.projectionMatrix(aspect), this.viewMatrix());
  }

  // Camera axes in world space = rows of the view matrix's rotation part.
  basis() {
    const V = this.viewMatrix();
    return {
      right: [V[0], V[4], V[8]],
      up: [V[1], V[5], V[9]],
      back: [V[2], V[6], V[10]],
    };
  }

  orbit(dx, dy) {
    this.yaw -= dx * 0.006;
    this.pitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, this.pitch + dy * 0.006));
  }

  zoom(factor) {
    this.distance = Math.min(25, Math.max(1.2, this.distance * factor));
  }

  // Move the target in the image plane; dx, dy are in pixels of a viewport of height h.
  pan(dx, dy, h) {
    const { right, up } = this.basis();
    const s = (2 * this.halfHeight()) / h;
    this.target = v3.add(this.target, v3.add(v3.scale(right, -dx * s), v3.scale(up, dy * s)));
  }

  // Ray through a point given in normalised device coordinates.
  ray(ndcX, ndcY, aspect) {
    const { right, up, back } = this.basis();
    const eye = this.eye;
    if (this.projection === 'perspective') {
      const t = Math.tan((this.fov * DEG) / 2);
      const dir = v3.normalize(v3.add(v3.scale(back, -1), v3.add(v3.scale(right, ndcX * t * aspect), v3.scale(up, ndcY * t))));
      return { origin: eye, dir };
    }
    const h = this.halfHeight();
    const origin = v3.add(eye, v3.add(v3.scale(right, ndcX * h * aspect), v3.scale(up, ndcY * h)));
    return { origin, dir: v3.scale(back, -1) };
  }

  // The 8 corners of the view volume in world space: [near x4, far x4], each in the
  // order bottom-left, bottom-right, top-right, top-left.
  frustumCorners(aspect) {
    const { right, up, back } = this.basis();
    const eye = this.eye;
    const t = Math.tan((this.fov * DEG) / 2);
    const corners = [];
    for (const d of [this.near, this.far]) {
      const h = this.projection === 'perspective' ? d * t : this.halfHeight();
      const w = h * aspect;
      const c = v3.add(eye, v3.scale(back, -d));
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        corners.push(v3.add(c, v3.add(v3.scale(right, sx * w), v3.scale(up, sy * h))));
      }
    }
    return corners;
  }

  // Smallest depth difference a 24-bit depth buffer can resolve at eye distance z.
  // Perspective: d(depth)/dz = n f / ((f - n) z^2), so dz = 2^-24 * z^2 (f - n) / (n f).
  depthStep(z) {
    const n = this.near, f = this.far, q = 2 ** -24;
    return this.projection === 'perspective' ? (q * z * z * (f - n)) / (n * f) : q * (f - n);
  }
}
