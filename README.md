# CS405 Project 1: Transformations, Projection & Curves

**Painting:** *Kavunlu Natürmort* (Still Life with Melon) by Şeker Ahmed Paşa, Sakıp Sabancı Museum.

A WebGPU application that hangs the painting in a small 3D scene. In front of it are a table, a box
controlled from the UI, a melon, and a desk lamp that moves. A curve traces the outline of the
painted melon, and a small cone travels along it. All matrix, camera and curve code is written by
hand in `src/math/`. No graphics or maths libraries are used. The only dependency is lil-gui for the
control panel.

## Running

```bash
npm install
npm run dev
```

Open the address Vite prints (normally http://localhost:5173). You need a browser with WebGPU:
a current Chrome or Edge, Safari 26+, or Firefox with WebGPU enabled.

Unit tests for the maths (Node 20+, no extra packages):

```bash
npm test
```

## Controls

### Mouse (main camera view)

| Action | Effect |
|---|---|
| left drag | orbit around the target |
| right drag or shift + drag | pan |
| wheel | zoom (changes orbit distance) |
| drag a white disc / blue square | move a curve knot / Bézier handle |
| double-click on the painting | add a curve segment ending at that point |

### Panel

**View & camera**
- *view*: main camera, the fixed inspection camera, or both side by side.
- *projection*: perspective or orthographic. The orthographic volume matches the perspective
  one at the target distance, so the scene keeps roughly the same size when you switch.
- *fov / near / far*: settings of the main camera.
- *top view*: puts the camera straight above the target. Here the up vector is parallel to the
  view direction, so this is the degenerate case for `lookAt`. The stats panel says when the
  fallback is used.
- *reset camera*, *reset whole scene*.

**Debug drawing**
- *node axes*: local x/y/z axes (red/green/blue) of every scene-graph node.
- *frustum*: the main camera's view volume, drawn in the inspection view.
- *ghost of other order*: wireframe of box-A as it would look with the other multiplication order.
- *matrix panel*: shows or hides the matrix read-outs at the bottom left.

**A · Transformations**: translation, rotation axis and angle, and scale of box-A. *order* switches
between `M = T·R·S` and `M = S·R·T`. Both matrices are always shown, and the one in use is highlighted.

**B · Scene graph**: pause or speed up the animation. *show matrices of* picks a node whose local
and world matrices (and its path from the root) appear in the panel.

**D · Curves**
- *curve type*: piecewise cubic Bézier with C¹ joints, or a Catmull–Rom spline through the knots.
- *control polygon*, *de Casteljau*: show or hide these drawings. *segment* and *t* choose which
  Bézier segment and parameter the de Casteljau construction is drawn for.
- *animate rider*, *rider speed*: the cone moves at constant speed (arc-length parametrised) and
  points along the tangent.
- *export JSON*: downloads `curve.json`, with points in normalised painting coordinates.
- *remove last segment* (at least 3 segments are kept), *reset curve*.

The stats panel (top left) shows the frame time, the number of vertices submitted per frame, the
GPU, the camera parameters and the depth resolution at the target.

## Curve export

[`public/curve.json`](public/curve.json) is the exported trace of the melon outline. It is loaded
at start-up, and *reset curve* returns to it. Coordinates run from (0, 0) at the bottom-left corner
of the painting to (1, 1) at the top-right. Points with `"role": "knot"` lie on the curve, and the
others are Bézier handles.

## Code layout

```
src/
  math/     vec3.js, mat4.js (column-major 4x4), curves.js (Bézier, de Casteljau, C1, Catmull–Rom, arc length)
  scene/    node.js (scene graph), scene.js (the objects and hierarchy), camera.js (orbit camera, rays, frustum), curve.js (editable traced curve)
  render/   renderer.js (WebGPU device, pipelines, draw loop), shaders.js (WGSL), geometry.js (procedural meshes), batch.js (lines / overlay triangles), color.js
  ui/       gui.js (lil-gui panel), input.js (mouse), overlay.js (text panels), style.css
  main.js   wires everything together and runs the frame loop
tests/      node:test unit tests for the maths and the scene graph
public/     the painting and curve.json
```

Conventions:
- Column vectors (`p' = M p`), right-handed world, y up. The painting lies in the z = 0 plane and
  faces +z.
- Matrices are `Float32Array(16)` in column-major order, uploaded to uniform buffers unchanged.
- Projection maps depth to [0, 1], WebGPU's convention, not OpenGL's.
- The painting texture is `rgba8unorm-srgb`, and the frame is rendered through an `-srgb` view of
  the canvas, so lighting is computed in linear space.

## Report

`report.pdf` is built from [`report/report.html`](report/report.html), with the screenshots in `report/img/`.
After editing the HTML, rebuild the PDF with `report/make-pdf.sh` (uses headless Chrome).
