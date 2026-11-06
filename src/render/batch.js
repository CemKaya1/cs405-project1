// Collects world-space lines and flat triangles each frame (xyz + rgba per vertex).

export class LineBatch {
  constructor() {
    this.data = [];
  }

  get count() {
    return this.data.length / 7;
  }

  line(a, b, color) {
    const c = color.length === 3 ? [...color, 1] : color;
    this.data.push(a[0], a[1], a[2], ...c, b[0], b[1], b[2], ...c);
  }

  polyline(points, color, closed = false) {
    for (let i = 0; i < points.length - 1; i++) this.line(points[i], points[i + 1], color);
    if (closed && points.length > 2) this.line(points[points.length - 1], points[0], color);
  }

  // x, y, z axes of a frame (red, green, blue).
  axes(origin, x, y, z) {
    this.line(origin, x, [0.95, 0.15, 0.1]);
    this.line(origin, y, [0.2, 0.85, 0.2]);
    this.line(origin, z, [0.2, 0.4, 1.0]);
  }

  toArray() {
    return new Float32Array(this.data);
  }
}

export class TriBatch {
  constructor() {
    this.data = [];
  }

  get count() {
    return this.data.length / 7;
  }

  tri(a, b, c, color) {
    const col = color.length === 3 ? [...color, 1] : color;
    for (const p of [a, b, c]) this.data.push(p[0], p[1], p[2], ...col);
  }

  // Filled disc in the plane z = const (the painting plane).
  disc(center, radius, color, segments = 18) {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
      this.tri(
        center,
        [center[0] + radius * Math.cos(a0), center[1] + radius * Math.sin(a0), center[2]],
        [center[0] + radius * Math.cos(a1), center[1] + radius * Math.sin(a1), center[2]],
        color,
      );
    }
  }

  square(center, half, color) {
    const [x, y, z] = center;
    const a = [x - half, y - half, z], b = [x + half, y - half, z], c = [x + half, y + half, z], d = [x - half, y + half, z];
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  // Thick polyline in the z = const plane: each segment becomes a quad.
  ribbon(points, halfWidth, color) {
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i], q = points[i + 1];
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * halfWidth, ny = (dx / len) * halfWidth;
      const a = [p[0] + nx, p[1] + ny, p[2]], b = [p[0] - nx, p[1] - ny, p[2]];
      const c = [q[0] - nx, q[1] - ny, q[2]], d = [q[0] + nx, q[1] + ny, q[2]];
      this.tri(a, b, c, color);
      this.tri(a, c, d, color);
    }
    // round joints so the ribbon has no gaps where it bends
    for (let i = 1; i < points.length - 1; i++) this.disc(points[i], halfWidth, color, 6);
  }

  toArray() {
    return new Float32Array(this.data);
  }
}
