import * as M from './math/mat4.js';
import * as v3 from './math/vec3.js';
import * as C from './math/curves.js';
import { initGPU, Renderer } from './render/renderer.js';
import { cube, sphere, cylinder, cone, paintingQuad, CUBE_EDGES } from './render/geometry.js';
import { LineBatch, TriBatch } from './render/batch.js';
import { srgb } from './render/color.js';
import { buildScene, updateAnimation, riderMatrix, partAMatrices, PAINTING, PART_A_DEFAULTS } from './scene/scene.js';
import { OrbitCamera } from './scene/camera.js';
import { TracedCurve } from './scene/curve.js';
import { createGui } from './ui/gui.js';
import { attachInput } from './ui/input.js';
import { FrameTimer, statsText, infoHtml } from './ui/overlay.js';

const DEG = Math.PI / 180;
const LIGHT_DIR = v3.normalize([0.55, -0.8, -0.45]);

// Small offsets in front of the painting so overlays don't z-fight with it.
const Z_RIBBON = 0.004, Z_POLY = 0.006, Z_CAST = 0.008, Z_MARK = 0.01;

const COLORS = {
  ribbon: srgb('#ff7a2f', 1),
  polygon: srgb('#9cc7ff', 0.85),
  knot: srgb('#ffffff', 1),
  handle: srgb('#8fc2ff', 1),
  hover: srgb('#ffd24a', 1),
  level1: srgb('#64d16b', 1),
  level2: srgb('#d36cf0', 1),
  point: srgb('#ff3b30', 1),
  ghost: srgb('#ffcf6b', 0.75),
  frustum: srgb('#ffd24a', 1),
  frustumNear: srgb('#ffffff', 0.6),
};

function showError(message) {
  const el = document.getElementById('error');
  el.hidden = false;
  el.textContent = message;
}

function defaultState() {
  return {
    mode: 'split',
    inspect: 'head',
    debug: { axes: false, frustum: true, ghost: true, panel: true },
    partA: { ...PART_A_DEFAULTS },
    anim: { play: true, speed: 1 },
    curve: { show: true, polygon: true, casteljau: true, segment: 1, t: 0.4, ride: true, speed: 0.35 },
  };
}

async function loadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url}`);
  return createImageBitmap(await res.blob(), { colorSpaceConversion: 'none' });
}

async function main() {
  const canvas = document.getElementById('gpu');
  let gpu;
  try {
    gpu = await initGPU(canvas);
  } catch (err) {
    showError(`${err.message} Try a current Chrome, Edge, Safari or Firefox with WebGPU enabled.`);
    return;
  }
  gpu.device.lost.then((info) => showError(`GPU device lost: ${info.message}`));

  const image = await loadImage(PAINTING.image);
  const paintingWidth = (PAINTING.height * image.width) / image.height;

  const renderer = new Renderer(gpu, image, paintingQuad(paintingWidth, PAINTING.height), {
    cube: cube(), sphere: sphere(), cylinder: cylinder(), cone: cone(),
  });

  const scene = buildScene(paintingWidth);
  const camera = new OrbitCamera({ far: 12 });
  const inspector = new OrbitCamera({
    target: [0.4, -0.2, 2.6], distance: 12.5, yaw: -72 * DEG, pitch: 26 * DEG, fov: 45, near: 0.1, far: 60,
  });

  const curve = new TracedCurve(paintingWidth, PAINTING.height);
  try {
    const res = await fetch('curve.json');
    curve.load(await res.json());
  } catch (err) {
    console.warn('curve.json not loaded, using built-in points', err);
    curve.loadFallback(image.width, image.height);
  }

  let state = defaultState();
  let time = 0;
  let riderDistance = 0;
  let hoverPoint = -1, activePoint = -1;
  let views = [];
  const nodeNames = [];
  scene.root.traverse((n) => { if (n.name !== 'root') nodeNames.push(n.name); });

  // ---------- layout ----------

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    const w = Math.max(1, Math.floor(cssW * dpr)), h = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    renderer.resize(w, h);

    const half = Math.floor(cssW / 2);
    const rects = {
      main: [[0, 0, cssW, cssH]],
      inspection: [[0, 0, cssW, cssH]],
      split: [[0, 0, half, cssH], [half, 0, cssW - half, cssH]],
    }[state.mode];
    const kinds = state.mode === 'split' ? ['main', 'inspection'] : [state.mode];

    views = kinds.map((kind, i) => {
      const rect = rects[i];
      const cam = kind === 'main' ? camera : inspector;
      const aspect = rect[2] / rect[3];
      return {
        kind, rect, aspect, camera: cam,
        viewProj: cam.viewProjection(aspect),
        viewport: rect.map((x) => Math.round(x * dpr)),
      };
    });

    const line = document.getElementById('split-line');
    line.hidden = state.mode !== 'split';
    line.style.left = `${half - 1}px`;
    document.getElementById('view-labels').innerHTML = views
      .map((v) => `<span style="left:${v.rect[0] + v.rect[2] - 130}px">${v.kind === 'main' ? 'main camera' : 'inspection camera'}</span>`)
      .join('');
  }

  // ---------- picking (main view only) ----------

  const mainView = () => views.find((v) => v.kind === 'main');

  function mainViewAt(x, y) {
    const v = mainView();
    if (!v) return null;
    const [rx, ry, rw, rh] = v.rect;
    return x >= rx && x < rx + rw && y >= ry && y < ry + rh ? v : null;
  }

  function toScreen(view, p) {
    const c = M.transformVec4(view.viewProj, [p[0], p[1], p[2], 1]);
    if (c[3] <= 1e-6) return null;
    const [rx, ry, rw, rh] = view.rect;
    return [rx + (c[0] / c[3] * 0.5 + 0.5) * rw, ry + (0.5 - c[1] / c[3] * 0.5) * rh];
  }

  // painting-local 2D point -> world
  const curveToWorld = (p, z) => M.transformPoint(scene.painting.world, [p[0], p[1], z]);

  // Cast a ray from the mouse and intersect it with the painting plane; returns the
  // hit in painting-local coordinates. The painting's frame is rigid, so invertRigid is enough.
  function toPaintingPlane(x, y) {
    const v = mainView();
    const [rx, ry, rw, rh] = v.rect;
    const ndcX = ((x - rx) / rw) * 2 - 1, ndcY = 1 - ((y - ry) / rh) * 2;
    const { origin, dir } = camera.ray(ndcX, ndcY, v.aspect);
    const W = scene.painting.world;
    const planePoint = M.getColumn(W, 3), normal = v3.normalize(M.getColumn(W, 2));
    const denom = v3.dot(dir, normal);
    if (Math.abs(denom) < 1e-6) return null;
    const t = v3.dot(v3.sub(planePoint, origin), normal) / denom;
    if (t < 0) return null;
    const hit = v3.add(origin, v3.scale(dir, t));
    const p = M.transformPoint(M.invertRigid(W), hit);
    return [p[0], p[1]];
  }

  function pickControlPoint(x, y) {
    if (!state.curve.show) return -1;
    const v = mainView();
    let best = -1, bestDist = 12;
    curve.points.forEach((p, i) => {
      if (!curve.editable(i)) return;
      const s = toScreen(v, curveToWorld(p, Z_MARK));
      if (!s) return;
      const d = Math.hypot(s[0] - x, s[1] - y);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }

  // ---------- actions used by the GUI and the mouse ----------

  const app = {
    state, camera, curve, nodeNames,
    mainViewAt, pickControlPoint,
    setHoverPoint: (i) => { hoverPoint = i; },
    setActivePoint: (i) => { activePoint = i; },
    dragControlPoint(i, x, y) {
      const p = toPaintingPlane(x, y);
      if (!p) return;
      // keep points on the canvas
      const hw = paintingWidth / 2, hh = PAINTING.height / 2;
      curve.move(i, [Math.min(hw, Math.max(-hw, p[0])), Math.min(hh, Math.max(-hh, p[1]))]);
    },
    addSegmentAt(x, y) {
      const p = toPaintingPlane(x, y);
      if (!p || Math.abs(p[0]) > paintingWidth / 2 || Math.abs(p[1]) > PAINTING.height / 2) return;
      curve.append(p);
      ui.refresh();
    },
    removeSegment() {
      curve.removeLast();
      ui.refresh();
    },
    resetCurve() {
      curve.reset();
      riderDistance = 0;
      ui.refresh();
    },
    exportCurve() {
      const json = JSON.stringify(curve.toJSON(PAINTING), null, 2);
      const url = URL.createObjectURL(new Blob([json + '\n'], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'curve.json';
      a.click();
      URL.revokeObjectURL(url);
      console.log(json);
    },
    topView() {
      camera.pitch = 90 * DEG; // exactly overhead: up is parallel to the view direction
    },
    resetCamera() {
      camera.reset();
      ui.refresh();
    },
    resetScene() {
      const fresh = defaultState();
      // keep the same objects (the GUI is bound to them), just copy the values back
      for (const key of Object.keys(fresh)) {
        if (typeof fresh[key] === 'object') Object.assign(state[key], fresh[key]);
        else state[key] = fresh[key];
      }
      camera.reset();
      curve.reset();
      time = 0;
      riderDistance = 0;
      ui.refresh();
    },
  };

  const ui = createGui(app);
  attachInput(canvas, app);

  // ---------- per-frame drawing helpers ----------

  function drawCurve(lines, tris) {
    const n = curve.segments;
    tris.ribbon(curve.sample(60 * n).map((p) => curveToWorld(p, Z_RIBBON)), 0.009, COLORS.ribbon);

    const bezier = curve.type === 'bezier';
    if (state.curve.polygon) {
      const poly = bezier ? curve.points : curve.knots();
      lines.polyline(poly.map((p) => curveToWorld(p, Z_POLY)), COLORS.polygon);
    }

    if (bezier && state.curve.casteljau) {
      const seg = Math.min(state.curve.segment, n - 1);
      const levels = C.deCasteljau(C.segmentPoints(curve.points, seg), state.curve.t);
      const colors = [null, COLORS.level1, COLORS.level2];
      for (let k = 1; k <= 2; k++) {
        const pts = levels[k].map((p) => curveToWorld(p, Z_CAST));
        tris.ribbon(pts, 0.004, colors[k]);
        pts.forEach((p) => tris.disc(p, 0.016, colors[k], 10));
      }
      tris.disc(curveToWorld(levels[3][0], Z_MARK), 0.026, COLORS.point);
    }

    curve.points.forEach((p, i) => {
      if (!curve.editable(i)) return;
      const w = curveToWorld(p, Z_MARK);
      const hot = i === hoverPoint || i === activePoint;
      if (C.isKnot(i)) tris.disc(w, hot ? 0.036 : 0.028, hot ? COLORS.hover : COLORS.knot);
      else tris.square(w, hot ? 0.026 : 0.019, hot ? COLORS.hover : COLORS.handle);
    });
  }

  // Drawn without depth test (see renderer), so axes inside a mesh stay visible.
  function drawAxes(lines) {
    const len = 0.2;
    scene.root.traverse((node) => {
      if (node === scene.root) return;
      const W = node.world;
      const o = M.getColumn(W, 3);
      const tip = (c) => v3.add(o, v3.scale(v3.normalize(M.getColumn(W, c)), len));
      lines.axes(o, tip(0), tip(1), tip(2));
    });
  }

  function drawGhost(lines, mats) {
    const other = state.partA.order === 'TRS' ? mats.SRT : mats.TRS;
    const W = M.multiply(scene.table.world, other);
    for (const [a, b] of CUBE_EDGES) lines.line(M.transformPoint(W, a), M.transformPoint(W, b), COLORS.ghost);
  }

  function drawFrustum(lines, aspect) {
    const c = camera.frustumCorners(aspect);
    const near = c.slice(0, 4), far = c.slice(4);
    lines.polyline(near, COLORS.frustum, true);
    lines.polyline(far, COLORS.frustum, true);
    for (let i = 0; i < 4; i++) lines.line(near[i], far[i], COLORS.frustum);
    const eye = camera.eye;
    if (camera.projection === 'perspective') near.forEach((p) => lines.line(eye, p, COLORS.frustumNear));
    // the camera's own axes at the eye
    const { right, up, back } = camera.basis();
    lines.axes(eye, v3.add(eye, v3.scale(right, 0.4)), v3.add(eye, v3.scale(up, 0.4)), v3.add(eye, v3.scale(back, 0.4)));
  }

  function curveInfo() {
    const n = curve.segments;
    // C1 check: difference between the tangents on both sides of each joint
    let worst = 0;
    if (curve.type === 'bezier') {
      for (let s = 0; s < n - 1; s++) {
        const a = C.bezierTangent(...C.segmentPoints(curve.points, s), 1);
        const b = C.bezierTangent(...C.segmentPoints(curve.points, s + 1), 0);
        worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1]));
      }
    }
    const seg = Math.min(state.curve.segment, n - 1);
    const q = curve.toNormalized(C.bezier(...C.segmentPoints(curve.points, seg), state.curve.t));
    const lines = [
      `${curve.type === 'bezier' ? 'piecewise cubic Bézier' : 'Catmull–Rom'}  ·  ${n} segments  ·  length ${curve.table.total.toFixed(3)}`,
    ];
    if (curve.type === 'bezier') {
      lines.push(`max |B'_i(1) − B'_i+1(0)| at joints = ${worst.toExponential(1)}`);
      lines.push(`segment ${seg}, t = ${state.curve.t.toFixed(3)}  →  B(t) = (${q[0].toFixed(3)}, ${q[1].toFixed(3)}) normalised`);
    }
    return lines.join('\n');
  }

  // ---------- frame loop ----------

  const timer = new FrameTimer();
  const statsEl = document.getElementById('stats');
  const infoEl = document.getElementById('info');
  let lastText = 0;

  function frame(now) {
    const dt = Math.min(timer.tick(now), 0.1);
    const t0 = performance.now();
    layout();

    if (state.anim.play) time += dt * state.anim.speed;
    updateAnimation(scene.root, time);

    const mats = partAMatrices(state.partA);
    scene.boxA.local = state.partA.order === 'TRS' ? mats.TRS : mats.SRT;

    if (state.curve.ride) riderDistance = (riderDistance + dt * state.curve.speed) % curve.table.total;
    const u = curve.paramAt(riderDistance);
    scene.rider.local = riderMatrix(curve.evaluate(u), curve.tangent(u));
    scene.rider.visible = state.curve.show;

    scene.root.updateWorld();

    const items = [];
    scene.root.traverse((n) => {
      if (n.mesh && n.visible) items.push({ mesh: n.mesh, model: n.world, color: n.color, emissive: n.emissive });
    });

    const lines = new LineBatch(), tris = new TriBatch(), axes = new LineBatch();
    if (state.curve.show) drawCurve(lines, tris);
    if (state.debug.axes) drawAxes(axes);
    if (state.debug.ghost) drawGhost(lines, mats);
    const sharedLines = lines.count;
    const main = mainView();
    const hasInspection = views.some((v) => v.kind === 'inspection');
    if (hasInspection && state.debug.frustum) {
      // frustum of the main camera with the aspect it is (or would be) drawn with
      const aspect = main ? main.aspect : canvas.clientWidth / canvas.clientHeight;
      drawFrustum(lines, aspect);
    }

    const vertices = renderer.render({
      views: views.map((v) => ({
        viewport: v.viewport,
        viewProj: v.viewProj,
        eye: v.camera.eye,
        lines: v.kind === 'inspection' ? lines.count : sharedLines,
        tris: tris.count,
        axes: axes.count,
      })),
      items,
      paintingModel: scene.painting.world,
      lightDir: LIGHT_DIR,
      lineData: lines.toArray(),
      triData: tris.toArray(),
      axesData: axes.toArray(),
    });
    const cpuMs = performance.now() - t0;

    // Text panels are cheap but not free; 10 updates a second is plenty.
    infoEl.hidden = !state.debug.panel;
    if (now - lastText > 100) {
      lastText = now;
      const drawCalls = views.length * (items.length + 1 + [tris, lines, axes].filter((b) => b.count).length);
      statsEl.textContent = statsText({ timer, cpuMs, vertices, drawCalls, gpuName: gpu.gpuName, camera, mode: state.mode });
      infoEl.innerHTML = infoHtml({ partA: state.partA, mats, node: scene.root.find(state.inspect), curveInfo: curveInfo() });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  showError(err.message);
});
