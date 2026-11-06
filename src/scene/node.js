import * as M from '../math/mat4.js';

// A scene-graph node. `local` places the node in its parent's frame; `world` is
// computed by traversal: world = parent.world * local.
export class Node {
  constructor(name, { local = M.identity(), mesh = null, color = [1, 1, 1], update = null } = {}) {
    this.name = name;
    this.local = local;
    this.world = M.identity();
    this.parent = null;
    this.children = [];
    this.mesh = mesh;      // name of a mesh, or null for a pure transform node
    this.color = color;
    this.update = update;  // optional (node, time) => void, sets node.local for animation
    this.visible = true;
  }

  add(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
    return this;
  }

  // Depth-first: parents are always finished before their children.
  updateWorld(parentWorld = M.identity()) {
    this.world = M.multiply(parentWorld, this.local);
    for (const child of this.children) child.updateWorld(this.world);
  }

  traverse(fn, depth = 0) {
    fn(this, depth);
    for (const child of this.children) child.traverse(fn, depth + 1);
  }

  find(name) {
    let found = null;
    this.traverse((n) => { if (!found && n.name === name) found = n; });
    return found;
  }

  // Path from the root down to this node, used for the "write the world matrix out" panel.
  path() {
    const nodes = [];
    for (let n = this; n; n = n.parent) nodes.unshift(n);
    return nodes;
  }
}
