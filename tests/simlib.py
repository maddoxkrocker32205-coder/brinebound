SIM = '''
window.__sim = (sec, fn) => {
  const g = window.__brinebound, dt = 1 / 30;
  for (let t = 0; t < sec; t += dt) {
    if (fn && fn(g, t) === false) break;
    g.waveTime += dt;
    g.sky.update(g.time, g.camera.position, g.weather.storm, dt);
    if (g.state === 'play') g.updatePlay(dt); else if (g.state === 'sheet') g.updateSheet(dt); else if (g.state === 'title') g.updateTitle(dt);
    g.input.endFrame();
  }
};
window.__aimAt = (x, y, z) => {
  const g = window.__brinebound, P = g.player;
  const ex = P.pos.x, ey = P.pos.y + 1.6, ez = P.pos.z;
  const dx = x - ex, dy = y - ey, dz = z - ez;
  P.yaw = Math.atan2(-dx, -dz);
  P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
};
window.__mine = (x, y, z, maxSec) => {
  const g = window.__brinebound;
  const id0 = g.world.get(x, y, z);
  g.input.mouseL = true;
  window.__sim(maxSec || 3, (g) => { window.__aimAt(x + 0.5, y + 0.5, z + 0.5); if (g.world.get(x, y, z) !== id0) return false; });
  g.input.mouseL = false;
  return g.world.get(x, y, z) !== id0;
};
window.__fight = (maxSec) => {
  const g = window.__brinebound;
  let t = 0;
  window.__sim(maxSec, (g) => {
    const P = g.player;
    const live = g.enemies.list.filter((s) => s.state !== 'dying' && s.state !== 'rising');
    if (!live.length && !g.enemies.list.some((s) => s.state === 'rising')) return false;
    let best = null;
    for (const s of live) { const d = Math.hypot(s.pos.x - P.pos.x, s.pos.z - P.pos.z); if (!best || d < best.d) best = { s, d }; }
    if (!best) return;
    window.__aimAt(best.s.pos.x, best.s.pos.y + 1.1, best.s.pos.z);
    g.input.mouseL = best.d < 3;
    g.input.move.y = best.d > 2 ? 1 : 0;
    g.input.keys.clear(); if (best.d > 2) g.input.keys.add('KeyW');
    P.hp = Math.max(P.hp, 60);
  });
  g.input.mouseL = false; g.input.keys.clear();
  return g.enemies.list.length;
};
0;
'''
