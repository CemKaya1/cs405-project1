// Procedural meshes. Vertex layout: position (3 floats) + normal (3 floats).
// Triangles are counter-clockwise when seen from outside (front face = 'ccw').
// All shapes fit in the unit cube [-0.5, 0.5]^3 (sphere: radius 0.5) so a scale
// matrix gives them their real size.

function mesh(vertices, indices) {
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

export function cube() {
  // For each face: normal n and two in-plane axes with a x b = n.
  const faces = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  ];
  const v = [], idx = [];
  for (const [n, a, b] of faces) {
    const base = v.length / 6;
    for (const [sa, sb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      for (let k = 0; k < 3; k++) v.push(0.5 * (n[k] + sa * a[k] + sb * b[k]));
      v.push(...n);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return mesh(v, idx);
}

export function sphere(rings = 24, sectors = 40) {
  const v = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const theta = (i / rings) * Math.PI;
    for (let j = 0; j <= sectors; j++) {
      const phi = (j / sectors) * Math.PI * 2;
      const n = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
      v.push(n[0] * 0.5, n[1] * 0.5, n[2] * 0.5, ...n);
    }
  }
  const row = sectors + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sectors; j++) {
      const a = i * row + j, b = a + row;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return mesh(v, idx);
}

// Cylinder along y, radius 0.5, from y = -0.5 to 0.5, with caps.
export function cylinder(sectors = 32) {
  const v = [], idx = [];
  for (let j = 0; j <= sectors; j++) {
    const phi = (j / sectors) * Math.PI * 2;
    const c = Math.cos(phi), s = Math.sin(phi);
    v.push(0.5 * c, 0.5, 0.5 * s, c, 0, s);
    v.push(0.5 * c, -0.5, 0.5 * s, c, 0, s);
  }
  for (let j = 0; j < sectors; j++) {
    const top = 2 * j, bot = top + 1, top2 = top + 2, bot2 = top + 3;
    idx.push(top, top2, bot, top2, bot2, bot);
  }
  addCap(v, idx, sectors, 0.5, 1);
  addCap(v, idx, sectors, -0.5, -1);
  return mesh(v, idx);
}

// Cone along y: base (radius 0.5) at y = -0.5, apex at y = 0.5.
export function cone(sectors = 32) {
  const v = [], idx = [];
  const ny = 0.5 / Math.hypot(1, 0.5); // slope of the side for height 1, radius 0.5
  const nr = 1 / Math.hypot(1, 0.5);
  for (let j = 0; j <= sectors; j++) {
    const phi = (j / sectors) * Math.PI * 2;
    const mid = ((j + 0.5) / sectors) * Math.PI * 2;
    v.push(0, 0.5, 0, nr * Math.cos(mid), ny, nr * Math.sin(mid)); // apex, one per sector
    v.push(0.5 * Math.cos(phi), -0.5, 0.5 * Math.sin(phi), nr * Math.cos(phi), ny, nr * Math.sin(phi));
  }
  for (let j = 0; j < sectors; j++) {
    const apex = 2 * j, base = apex + 1, base2 = apex + 3;
    idx.push(apex, base2, base);
  }
  addCap(v, idx, sectors, -0.5, -1);
  return mesh(v, idx);
}

function addCap(v, idx, sectors, y, dir) {
  const center = v.length / 6;
  v.push(0, y, 0, 0, dir, 0);
  for (let j = 0; j <= sectors; j++) {
    const phi = (j / sectors) * Math.PI * 2;
    v.push(0.5 * Math.cos(phi), y, 0.5 * Math.sin(phi), 0, dir, 0);
  }
  for (let j = 0; j < sectors; j++) {
    const a = center + 1 + j, b = a + 1;
    if (dir > 0) idx.push(center, b, a);
    else idx.push(center, a, b);
  }
}

// Textured quad for the painting: position (3) + uv (2), in the z = 0 plane.
export function paintingQuad(width, height) {
  const w = width / 2, h = height / 2;
  return {
    vertices: new Float32Array([
      -w, -h, 0, 0, 1,
      w, -h, 0, 1, 1,
      w, h, 0, 1, 0,
      -w, h, 0, 0, 0,
    ]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  };
}

// The 12 edges of the unit cube, used for the wireframe "ghost" in Part A.
export const CUBE_EDGES = (() => {
  const c = [];
  for (let i = 0; i < 8; i++) c.push([(i & 1) - 0.5, ((i >> 1) & 1) - 0.5, ((i >> 2) & 1) - 0.5]);
  const edges = [];
  for (let i = 0; i < 8; i++) {
    for (const bit of [1, 2, 4]) if (!(i & bit)) edges.push([c[i], c[i | bit]]);
  }
  return edges;
})();
