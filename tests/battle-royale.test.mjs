import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BattleRoyale, DROP_INTERVAL, FALL_SECONDS, ROUND_SECONDS, RADII } from '../src/battle-royale.js';

function setup(saved) {
  const game = {
    scene: new THREE.Scene(),
    world: { spawn: { x: 900, z: 900 }, standY: () => 70 },
    player: { alive: true, pos: { x: 900, y: 70, z: 900 }, hp: 100, hurt(n) { this.hp -= n; } },
    ui: { toast() {} }, given: [],
    give(item, n) { this.given.push([item, n]); },
    onRoyaleEnd() { this.ended = true; },
  };
  return [game, new BattleRoyale(game, saved)];
}

test('phases shrink and outside damage increases with distance and phase', () => {
  const [g, br] = setup();
  assert.equal(br.radius, RADII[0]);
  assert.equal(br.damageAt(br.x + 500, br.z), 0);
  br.elapsed = 12;
  assert.equal(br.stage, 'warning');
  assert.equal(br.damageAt(br.x + 500, br.z), 0);
  br.elapsed = 26;
  assert.equal(br.stage, 'damage');
  assert.equal(br.damageAt(br.x, br.z), 0);
  assert.ok(br.damageAt(br.x + br.radius + 100, br.z) > br.damageAt(br.x + br.radius + 1, br.z));
  br.elapsed = ROUND_SECONDS + 26;
  assert.ok(br.damageAt(br.x + br.radius + 100, br.z) > 6);
  br.dispose();
});

test('drops fall, can be collected once, expire, and recur after 130 seconds', () => {
  const [g, br] = setup();
  br.update(0.1);
  assert.equal(br.drops.length, 1);
  assert.equal(br.nextDrop, br.elapsed + DROP_INTERVAL);
  const drop = br.drops[0];
  g.player.pos = { x: drop.x, y: drop.y, z: drop.z };
  br.update(1);
  assert.equal(g.given.length, 0);
  br.update(FALL_SECONDS);
  assert.equal(g.given.length, 1);
  assert.equal(br.drops.length, 0);
  br.update(DROP_INTERVAL);
  assert.equal(br.drops.length, 1);
  const next = br.drops[0];
  g.player.pos = { x: br.x, y: 70, z: br.z };
  br.nextDrop = 10000;
  br.update(next.expires - br.elapsed + 0.1);
  assert.equal(br.drops.length, 0);
  br.dispose();
});

test('save round trip, completion, disposal and ended matches', () => {
  const [g, br] = setup();
  br.update(1);
  const snapshot = br.serialize();
  const [g2, loaded] = setup(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(loaded.serialize(), snapshot);
  assert.equal(loaded.group.parent, g2.scene);
  loaded.elapsed = 299;
  loaded.update(1);
  assert.equal(loaded.result, 'won');
  assert.equal(g2.ended, true);
  assert.equal(loaded.wall.visible, false);
  loaded.dispose();
  assert.equal(loaded.group.parent, null);
  br.result = 'lost';
  const [g3, lost] = setup(br.serialize());
  lost.update(100);
  assert.equal(lost.result, 'lost');
  assert.equal(g3.ended, undefined);
  br.dispose(); lost.dispose();
});
