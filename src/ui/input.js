// Mouse handling for the main view: orbit / pan / zoom the camera, and drag curve
// control points. All coordinates here are CSS pixels relative to the canvas.

export function attachInput(canvas, app) {
  let drag = null;

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = local(e);
    const view = app.mainViewAt(x, y);
    if (!view) return;
    canvas.setPointerCapture(e.pointerId);
    const pan = e.button === 2 || e.shiftKey;
    if (!pan && e.button === 0) {
      const index = app.pickControlPoint(x, y);
      if (index >= 0) {
        drag = { mode: 'point', index };
        app.setActivePoint(index);
        return;
      }
    }
    drag = { mode: pan ? 'pan' : 'orbit', x: e.clientX, y: e.clientY, height: view.rect[3] };
  });

  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (!drag) {
      const hover = app.mainViewAt(x, y) ? app.pickControlPoint(x, y) : -1;
      app.setHoverPoint(hover);
      canvas.style.cursor = hover >= 0 ? 'grab' : 'default';
      return;
    }
    if (drag.mode === 'point') {
      app.dragControlPoint(drag.index, x, y);
      canvas.style.cursor = 'grabbing';
      return;
    }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.mode === 'orbit') app.camera.orbit(dx, dy);
    else app.camera.pan(dx, dy, drag.height);
  });

  const end = () => {
    drag = null;
    app.setActivePoint(-1);
    canvas.style.cursor = 'default';
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('wheel', (e) => {
    const [x, y] = local(e);
    if (!app.mainViewAt(x, y)) return;
    e.preventDefault();
    app.camera.zoom(Math.exp(e.deltaY * 0.0012));
  }, { passive: false });

  canvas.addEventListener('dblclick', (e) => {
    const [x, y] = local(e);
    if (app.mainViewAt(x, y)) app.addSegmentAt(x, y);
  });
}
