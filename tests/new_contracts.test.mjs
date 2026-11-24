import test from 'node:test';
import assert from 'node:assert/strict';
import { Quests } from '../src/quests.js';

function game() {
  const islands = [
    { name: 'Home', x: 0, z: 0, r: 20, type: 'outpost' },
    { name: 'Remote', x: 200, z: 200, r: 30, type: 'forest' },
    { name: 'Other', x: 400, z: 400, r: 30, type: 'forest' },
  ];
  const G = {
    world: { islands, sites: { villages: [] }, buildCamp: (i) => ({ island: i, x: islands[i].x, z: islands[i].z, y: 65, fire: {} }),
      placeTreasure: (_, i) => ({ x: islands[i].x, y: 62, z: islands[i].z }),
      walkStep: (_, y) => y },
    player: { alive: true, mode: 'foot', pos: { x: 0, y: 65, z: 0 }, hp: 100 },
    sloop: { pos: { x: 200, z: 200 } }, sky: { day: 1 }, level: 1, inv: {}, banked: 0,
    ui: { toast() {}, pickup() {} }, sfx: { bell() {}, place() {}, coin() {} },
    props: { bottles: [] }, enemies: { list: [], waves: 0, spawnNear() { this.waves++; } },
    npcs: { get: () => null }, autosave() {}, net: null, look: { name: 'Tester' },
  };
  G.quests = new Quests(G);
  G.quests.step = 8;
  G.quests.offerDay = 1;
  G.quests.bottleT = Infinity;
  return G;
}

function take(G, giver, kind, island = 1) {
  G.quests.offers[giver] = [{ oid: 'test', kind, giver, island, title: kind, reward: 200 }];
  assert.equal(G.quests.accept(giver, 'test'), true);
  return G.quests.active.at(-1);
}

test('territory requires a clear camp, continuous hold, waves and awards a safety bonus', () => {
  const G = game(), Q = G.quests, q = take(G, 'blackstone', 'territory');
  const c = Q.camps[q.camp];
  G.player.pos = { x: c.x, y: c.y, z: c.z };
  Q.update(1);
  assert.equal(q.held, undefined);
  c.cleared = true;
  for (let i = 0; i < 30; i++) Q.update(1);
  assert.equal(q.held, 30);
  G.player.pos.x += 20;
  Q.update(1);
  assert.equal(q.held, 0);
  G.player.pos.x = c.x;
  for (let i = 0; i < 60; i++) Q.update(1);
  assert.equal(q.state, 'ready');
  assert.ok(G.enemies.waves >= 4);
  assert.equal(q.reward, 300);
  Q.turnIn(q.id, 'ironhook');
  assert.equal(G.banked, 0);
  Q.turnIn(q.id, 'blackstone');
  assert.equal(G.banked, 300);
});

test('escape fails after deadline and rewards a fast safe run; state survives load', () => {
  const G = game(), Q = G.quests, q = take(G, 'ironhook', 'escape');
  const c = Q.camps[q.camp];
  G.player.pos = { x: c.x, y: c.y, z: c.z };
  Q.update(1);
  assert.equal(q.entered, true);
  Q.update(90);
  assert.equal(q.entered, false);
  G.player.pos.x += 30;
  Q.update(1);
  G.player.pos.x = c.x;
  Q.update(1);
  const saved = JSON.parse(JSON.stringify(Q.serialize()));
  Q.load(saved);
  Q.bottleT = Infinity;
  const loaded = Q.active[0];
  assert.equal(loaded.entered, true);
  G.player.mode = 'helm';
  G.sloop.pos = { x: c.x + 101, z: c.z };
  Q.update(1);
  assert.equal(loaded.state, 'ready');
  assert.equal(loaded.reward, 300);
});

test('privateer counts only pirates, prophecy requires digging, and old saves gain boards', () => {
  const G = game(), Q = G.quests;
  Q.load({ active: [], offers: { mags: [], tallow: [] } });
  assert.ok(Q.offers.ironhook.length && Q.offers.seer.length && Q.offers.blackstone.length);
  const q = take(G, 'blackstone', 'privateer');
  Q.onShipSunk({ kind: 'merchant' });
  assert.equal(q.sunk, undefined);
  Q.onShipSunk({ kind: 'pirate' });
  assert.equal(q.sunk, 1);
  Q.onShipSunk({ kind: 'pirate' });
  assert.equal(q.state, 'ready');
  const vision = take(G, 'seer', 'prophecy', 2);
  Q.onChestOpened(vision.x, vision.y + 1, vision.z);
  assert.equal(vision.state, 'active');
  Q.onChestOpened(vision.x, vision.y, vision.z);
  assert.equal(vision.state, 'ready');
});

test('rescue requires the captain, escort, protection and an actual ship evacuation', () => {
  const G = game(), Q = G.quests, q = take(G, 'ironhook', 'rescue');
  const camp = Q.camps[q.camp];
  assert.equal(Q.dialog(`survivor:${q.id}`).story, null);
  camp.cleared = true;
  Q.dialog(`survivor:${q.id}`).story.act();
  G.player.pos = { x: camp.x + 8, y: camp.y, z: camp.z };
  Q.update(1);
  assert.ok(q.survivor.x > camp.x);
  assert.equal(G.enemies.waves, 1);
  G.player.pos.x = q.survivor.x + 1;
  G.enemies.list.push({ state: 'walk', pos: { ...q.survivor } });
  Q.update(1);
  assert.equal(q.survivor.hp, 90);
  const saved = JSON.parse(JSON.stringify(Q.serialize()));
  Q.load(saved); Q.bottleT = Infinity;
  const restored = Q.active[0];
  assert.equal(restored.survivor.hp, 90);
  G.enemies.list = [];
  G.player.mode = 'deck'; G.player.ship = G.sloop;
  G.sloop.pos = { x: restored.survivor.x + 10, z: restored.survivor.z };
  Q.update(1);
  assert.equal(restored.state, 'ready');
  assert.equal(restored.reward, 300);
});

test('conflicting offers stay on the displayed board and explain rejection', () => {
  const G = game(), Q = G.quests, messages = [];
  G.ui.toast = (...args) => messages.push(args);
  take(G, 'ironhook', 'escape');
  const offer = { oid: 'stale', kind: 'escape', giver: 'seer', island: 2, title: 'escape', reward: 200 };
  Q.offers.seer = [offer];
  assert.equal(Q.accept('seer', 'stale'), false);
  assert.equal(Q.offers.seer[0], offer);
  assert.match(messages[0][0], /unavailable/i);
});
