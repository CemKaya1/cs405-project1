import GUI from 'lil-gui';
import { CURVE_TYPES } from '../scene/curve.js';

// Control panel. `app` exposes the state objects and a few actions.
export function createGui(app) {
  const { state, camera, curve } = app;
  const gui = new GUI({ title: 'CS405 · Project 1' });

  const view = gui.addFolder('View & camera');
  view.add(state, 'mode', { 'Side by side': 'split', 'Main camera': 'main', 'Inspection camera': 'inspection' }).name('view');
  view.add(camera, 'projection', { Perspective: 'perspective', Orthographic: 'orthographic' }).name('projection');
  view.add(camera, 'fov', 15, 100, 1).name('fov (deg)');
  view.add(camera, 'near', 0.01, 2, 0.01).name('near');
  view.add(camera, 'far', 2, 100, 0.5).name('far');
  view.add(app, 'topView').name('top view (up ∥ view dir)');
  view.add(app, 'resetCamera').name('reset camera');
  view.add(app, 'resetScene').name('reset whole scene');

  const debug = gui.addFolder('Debug drawing');
  debug.add(state.debug, 'axes').name('node axes');
  debug.add(state.debug, 'frustum').name('frustum (inspection view)');
  debug.add(state.debug, 'ghost').name('ghost of other order');
  debug.add(state.debug, 'panel').name('matrix panel');

  const a = gui.addFolder('A · Transformations');
  const p = state.partA;
  a.add(p, 'order', { 'M = T·R·S': 'TRS', 'M = S·R·T': 'SRT' }).name('order');
  a.add(p, 'tx', -2, 2, 0.01).name('translate x');
  a.add(p, 'ty', -1, 2, 0.01).name('translate y');
  a.add(p, 'tz', -1, 1.5, 0.01).name('translate z');
  a.add(p, 'axis', ['x', 'y', 'z']).name('rotation axis');
  a.add(p, 'angle', -180, 180, 1).name('angle (deg)');
  a.add(p, 'sx', 0.1, 2, 0.01).name('scale x');
  a.add(p, 'sy', 0.1, 2, 0.01).name('scale y');
  a.add(p, 'sz', 0.1, 2, 0.01).name('scale z');

  const b = gui.addFolder('B · Scene graph');
  b.add(state.anim, 'play').name('animate');
  b.add(state.anim, 'speed', 0, 4, 0.05).name('speed');
  b.add(state, 'inspect', app.nodeNames).name('show matrices of');

  const d = gui.addFolder('D · Curves');
  d.add(curve, 'type', Object.fromEntries(Object.entries(CURVE_TYPES).map(([k, v]) => [v, k])))
    .name('curve type').onChange(() => curve.changed());
  d.add(state.curve, 'show').name('show curve');
  d.add(state.curve, 'polygon').name('control polygon');
  d.add(state.curve, 'casteljau').name('de Casteljau');
  const seg = d.add(state.curve, 'segment', 0, curve.segments - 1, 1).name('segment');
  d.add(state.curve, 't', 0, 1, 0.005).name('t');
  d.add(state.curve, 'ride').name('animate rider');
  d.add(state.curve, 'speed', 0.05, 1.5, 0.05).name('rider speed');
  d.add(app, 'exportCurve').name('export JSON');
  d.add(app, 'removeSegment').name('remove last segment');
  d.add(app, 'resetCurve').name('reset curve');

  return {
    gui,
    refresh() {
      seg.max(curve.segments - 1);
      state.curve.segment = Math.min(state.curve.segment, curve.segments - 1);
      for (const c of gui.controllersRecursive()) c.updateDisplay();
    },
  };
}
