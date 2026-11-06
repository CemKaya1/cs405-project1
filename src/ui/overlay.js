import * as M from '../math/mat4.js';

const fmt3 = (v) => `(${v.map((x) => x.toFixed(2)).join(', ')})`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Smoothed frame timing over the last N frames.
export class FrameTimer {
  constructor(n = 60) {
    this.n = n;
    this.samples = [];
    this.last = 0;
  }

  tick(now) {
    const dt = this.last ? now - this.last : 16.7;
    this.last = now;
    this.samples.push(dt);
    if (this.samples.length > this.n) this.samples.shift();
    return dt / 1000;
  }

  get average() {
    return this.samples.reduce((a, b) => a + b, 0) / Math.max(1, this.samples.length);
  }

  get worst() {
    return Math.max(...this.samples);
  }
}

export function statsText({ timer, cpuMs, vertices, drawCalls, gpuName, camera, mode }) {
  const avg = timer.average;
  const eye = camera.eye;
  const lines = [
    `frame   ${avg.toFixed(2)} ms  (${(1000 / avg).toFixed(0)} fps, worst ${timer.worst.toFixed(1)} ms)`,
    `cpu     ${cpuMs.toFixed(2)} ms to build the frame`,
    `verts   ${vertices.toLocaleString('en-US')} submitted / frame  (${drawCalls} draws)`,
    `gpu     ${gpuName}`,
    '',
    `view    ${mode}   ·   ${camera.projection}`,
    `eye     ${fmt3(eye)}`,
    `target  ${fmt3(camera.target)}`,
    `fov ${camera.fov.toFixed(0)}°   near ${camera.near.toFixed(2)}   far ${camera.far.toFixed(1)}`,
    `depth step at target ≈ ${camera.depthStep(camera.distance).toExponential(2)} units (24-bit)`,
  ];
  if (camera.degenerate) lines.push('lookAt: up ∥ view direction → fallback up used');
  return lines.join('\n');
}

function matrixBlock(title, m, cls = '') {
  return `<div class="${cls}"><h4>${esc(title)}</h4>${M.format(m, 2)}</div>`;
}

export function infoHtml({ partA, mats, node, curveInfo }) {
  const activeTRS = partA.order === 'TRS';
  const parts = [];
  parts.push('<h4>Part A · box-A local matrix</h4>');
  parts.push(`<span class="dim">T(${partA.tx.toFixed(2)}, ${partA.ty.toFixed(2)}, ${partA.tz.toFixed(2)})  `
    + `R${partA.axis}(${partA.angle}°)  S(${partA.sx.toFixed(2)}, ${partA.sy.toFixed(2)}, ${partA.sz.toFixed(2)})</span>`);
  parts.push('<div style="display:flex;gap:18px">'
    + matrixBlock(`T·R·S${activeTRS ? '  (in use)' : ''}`, mats.TRS, activeTRS ? 'active' : 'dim')
    + matrixBlock(`S·R·T${activeTRS ? '' : '  (in use)'}`, mats.SRT, activeTRS ? 'dim' : 'active')
    + '</div>');

  const path = node.path().map((n) => n.name).join(' → ');
  parts.push(`\n<h4>Part B · ${esc(node.name)}</h4><span class="dim">${esc(path)}</span>`);
  parts.push('<div style="display:flex;gap:18px">'
    + matrixBlock('local', node.local)
    + matrixBlock('world = parent.world · local', node.world)
    + '</div>');

  parts.push(`\n<h4>Part D · curve</h4>${curveInfo}`);
  return parts.join('\n');
}
