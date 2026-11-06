import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/math/mat4.js';
import { Node } from '../src/scene/node.js';

test('world matrix is the product of the locals along the path', () => {
  const root = new Node('root', { local: M.translate(0, -1, 0) });
  const arm = new Node('arm', { local: M.rotateZ(0.5) });
  const hand = new Node('hand', { local: M.translate(0, 2, 0) });
  root.add(arm);
  arm.add(hand);
  root.updateWorld();

  const expected = M.multiplyAll(root.local, arm.local, hand.local);
  hand.world.forEach((x, i) => assert.ok(Math.abs(x - expected[i]) < 1e-6));
  assert.deepEqual(hand.path().map((n) => n.name), ['root', 'arm', 'hand']);
});

test('moving a parent moves its children', () => {
  const root = new Node('root');
  const child = new Node('child', { local: M.translate(1, 0, 0) });
  root.add(child);
  root.local = M.translate(0, 5, 0);
  root.updateWorld();
  assert.deepEqual(Array.from(M.transformPoint(child.world, [0, 0, 0])), [1, 5, 0]);
});
