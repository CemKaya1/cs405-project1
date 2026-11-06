import * as M from '../math/mat4.js';
import * as v3 from '../math/vec3.js';
import { Node } from './node.js';
import { srgb } from '../render/color.js';

const DEG = Math.PI / 180;
const { multiplyAll: mul, translate: T, scale: S, rotateX: Rx, rotateY: Ry, rotateZ: Rz } = M;

export const PAINTING = {
  title: 'Kavunlu Natürmort',
  artist: 'Şeker Ahmed Paşa',
  image: 'kavunlu.jpg',
  height: 2,   // world units; width follows the image aspect ratio
};

// Part A object, driven by the UI.
export const PART_A_DEFAULTS = {
  order: 'TRS',
  tx: -0.95, ty: 0.32, tz: 0.15,
  axis: 'z',
  angle: 30,
  sx: 0.55, sy: 0.3, sz: 0.3,
};

export function partAMatrices(p) {
  const t = T(p.tx, p.ty, p.tz);
  const r = M.rotate(p.axis, p.angle * DEG);
  const s = S(p.sx, p.sy, p.sz);
  return { T: t, R: r, S: s, TRS: mul(t, r, s), SRT: mul(s, r, t) };
}

/*
  root
  ├── wall
  ├── painting                      (textured quad, z = 0 plane)
  │   ├── frame-top / -bottom / -left / -right
  │   └── rider                     (follows the traced curve)
  └── table
      ├── table-top
      ├── box-A                     (Part A: T·R·S or S·R·T from the UI)
      ├── melon
      │   ├── melon-body
      │   └── stem
      ├── plate
      └── lamp
          ├── lamp-base
          └── swivel                (animated: turns about y)
              ├── arm-1
              └── elbow             (animated: bends about z)
                  ├── elbow-joint
                  ├── arm-2
                  └── head          (animated: nods)
                      ├── shade
                      └── bulb
*/
export function buildScene(paintingWidth) {
  const PH = PAINTING.height, PW = paintingWidth;
  const root = new Node('root');

  const wall = new Node('wall', { mesh: 'cube', color: srgb('#2a2622'), local: mul(T(0, 0.2, -0.12), S(9, 6, 0.1)) });

  // Painting and its frame. The frame bars sit just outside the painted area.
  const painting = new Node('painting');
  const bar = 0.1, depth = 0.07, frameColor = srgb('#5a3b1f');
  const frame = [
    ['frame-top', T(0, PH / 2 + bar / 2, -0.01), S(PW + 2 * bar, bar, depth)],
    ['frame-bottom', T(0, -PH / 2 - bar / 2, -0.01), S(PW + 2 * bar, bar, depth)],
    ['frame-left', T(-PW / 2 - bar / 2, 0, -0.01), S(bar, PH, depth)],
    ['frame-right', T(PW / 2 + bar / 2, 0, -0.01), S(bar, PH, depth)],
  ].map(([name, t, s]) => new Node(name, { mesh: 'cube', color: frameColor, local: mul(t, s) }));
  painting.add(...frame);

  const rider = new Node('rider', { mesh: 'cone', color: srgb('#d8452a') });
  painting.add(rider);

  // Table in front of the painting; y = 0 in its frame is the top surface.
  const table = new Node('table', { local: T(0, -1.3, 0.75) });
  const tableTop = new Node('table-top', { mesh: 'cube', color: srgb('#8b7d6b'), local: mul(T(0, -0.05, 0), S(3.6, 0.1, 1.3)) });

  const boxA = new Node('box-A', { mesh: 'cube', color: srgb('#3f7fb5') });

  // The melon: the transform node is separate from the scaled body so the stem is not
  // squashed by the body's non-uniform scale.
  const melon = new Node('melon', { local: mul(T(0.1, 0.27, 0.05), Ry(-25 * DEG), Rz(-6 * DEG)) });
  melon.add(
    new Node('melon-body', { mesh: 'sphere', color: srgb('#c9a43a'), local: S(0.78, 0.48, 0.5) }),
    new Node('stem', { mesh: 'cylinder', color: srgb('#5b4a22'), local: mul(T(-0.4, 0.03, 0), Rz(80 * DEG), S(0.025, 0.12, 0.025)) }),
  );
  const plate = new Node('plate', { mesh: 'cylinder', color: srgb('#d9d4c7'), local: mul(T(0.1, 0.015, 0.05), S(0.95, 0.03, 0.7)) });

  // Desk lamp: base -> swivel -> arm 1 -> elbow -> arm 2 -> head -> shade/bulb.
  const ARM1 = 0.9, ARM2 = 0.55;
  const lamp = new Node('lamp', { local: T(1.2, 0, -0.15) });
  const lampMetal = srgb('#2b2d30');
  const swivel = new Node('swivel', {
    update: (n, t) => { n.local = mul(T(0, 0.05, 0), Ry(0.45 * Math.sin(0.4 * t)), Rz(16 * DEG)); },
  });
  const elbow = new Node('elbow', {
    update: (n, t) => { n.local = mul(T(0, ARM1, 0), Rz((98 + 10 * Math.sin(0.9 * t)) * DEG)); },
  });
  const head = new Node('head', {
    update: (n, t) => { n.local = mul(T(0, ARM2, 0), Rz((55 + 12 * Math.sin(0.7 * t + 1)) * DEG)); },
  });
  head.add(
    new Node('shade', { mesh: 'cone', color: srgb('#7a2a1d'), local: mul(T(0, 0.1, 0), Rx(Math.PI), S(0.26, 0.2, 0.26)) }),
    new Node('bulb', { mesh: 'sphere', color: srgb('#ffe9a8'), local: mul(T(0, 0.2, 0), S(0.1)) }),
  );
  head.find('bulb').emissive = 0.9;
  elbow.add(
    new Node('elbow-joint', { mesh: 'sphere', color: lampMetal, local: S(0.075) }),
    new Node('arm-2', { mesh: 'cylinder', color: lampMetal, local: mul(T(0, ARM2 / 2, 0), S(0.035, ARM2, 0.035)) }),
    head,
  );
  swivel.add(
    new Node('arm-1', { mesh: 'cylinder', color: lampMetal, local: mul(T(0, ARM1 / 2, 0), S(0.04, ARM1, 0.04)) }),
    elbow,
  );
  lamp.add(
    new Node('lamp-base', { mesh: 'cylinder', color: lampMetal, local: mul(T(0, 0.025, 0), S(0.36, 0.05, 0.36)) }),
    swivel,
  );

  table.add(tableTop, boxA, melon, plate, lamp);
  root.add(wall, painting, table);

  return { root, painting, table, boxA, rider };
}

// Place the rider on the curve: its local y axis (the cone's tip) follows the tangent,
// z stays the painting normal, x = y × z completes a right-handed frame.
export function riderMatrix(position, tangent, size = 0.09) {
  const t = v3.normalize([tangent[0], tangent[1], 0]);
  const z = [0, 0, 1];
  const x = v3.cross(t, z);
  const frame = M.fromBasis(x, t, z, [position[0], position[1], 0.06]);
  return M.multiply(frame, S(size * 0.7, size * 1.6, size * 0.7));
}

export function updateAnimation(root, time) {
  root.traverse((n) => { if (n.update) n.update(n, time); });
}
