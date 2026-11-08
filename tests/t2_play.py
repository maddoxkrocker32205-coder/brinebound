import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *

SIM = '''
window.__sim = (sec, fn) => {
  const g = window.__brinebound, dt = 1 / 30;
  for (let t = 0; t < sec; t += dt) {
    if (fn) fn(g, t);
    g.waveTime += dt;
    g.sky.update(g.time, g.camera.position);
    if (g.state === 'play') g.updatePlay(dt); else if (g.state === 'sheet') g.updateSheet(dt);
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
0;
'''

async def ev(page, js):
    return await page.evaluate(js)

async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p)
            await load(page)
            await page.click('#bStart')
            await page.wait_for_timeout(800)
            await ev(page, SIM)
            await page.wait_for_timeout(600)
            await shot(page, 'p1_spawn')
            # find nearest log
            r = await ev(page, '''() => {
              const g = window.__brinebound, w = g.world, P = g.player;
              let best = null;
              for (let x = Math.floor(P.pos.x) - 25; x < P.pos.x + 25; x++) for (let z = Math.floor(P.pos.z) - 25; z < P.pos.z + 25; z++) {
                for (let y = 12; y < 30; y++) { if (w.get(x,y,z) === 5 && w.get(x,y-1,z) !== 5 && w.get(x,y-1,z) !== 0) { const d = Math.hypot(x - P.pos.x, z - P.pos.z); if (!best || d < best.d) best = {x,y,z,d}; } }
              }
              return best;
            }''')
            print('log', r)
            # stand next to the trunk (west side) and mine 3 logs
            got = await ev(page, f'''() => {{
              const g = window.__brinebound, P = g.player, w = g.world;
              const t = {json.dumps(r)};
              let px = t.x - 1.5, pz = t.z + 0.5;
              P.pos.set(px, w.topSolid(Math.floor(px), Math.floor(pz)) + 1, pz); P.vel.set(0,0,0);
              const before = g.inv.wood;
              for (let k = 0; k < 3; k++) {{
                window.__aimAt(t.x + 0.5, t.y + 0.5 + k, t.z + 0.5);
                g.input.mouseL = true;
                window.__sim(1.4, (g) => window.__aimAt(t.x + 0.5, t.y + 0.5 + k, t.z + 0.5));
              }}
              g.input.mouseL = false;
              return {{ wood: g.inv.wood, before, stats: g.stats, goal: g.goalIdx, hp: P.hp, pos: P.pos.toArray() }};
            }}''')
            print('mined', got)
            await page.wait_for_timeout(300)
            await shot(page, 'p2_mined')
            # craft via UI
            await ev(page, '() => window.__brinebound.toggleSheet("craft")')
            await page.wait_for_timeout(400)
            await shot(page, 'p3_craft')
            await page.click('#craft-plank')
            await page.wait_for_timeout(200)
            await page.click('#bCraftClose')
            await page.wait_for_timeout(300)
            c = await ev(page, '() => { const g = window.__brinebound; return { plank: g.inv.plank, wood: g.inv.wood, crafted: g.stats.crafted, state: g.state, goal: g.goalIdx } }')
            print('craft', c)
            # walk onto the pier toward the ship
            bd = await ev(page, '''() => {
              const g = window.__brinebound, P = g.player, w = g.world, s = g.sloop;
              const d = w.dock;
              P.pos.set(d.x, 13.001, d.z - 3.4); P.vel.set(0,0,0);
              P.yaw = Math.PI; // face +z (south) toward the ship
              P.pitch = 0;
              const pre = { y: P.pos.y, mode: P.mode };
              g.input.keys.add('KeyW');
              window.__sim(1.2);
              g.input.keys.delete('KeyW');
              return { pre, mode: P.mode, pos: P.pos.toArray(), local: P.local.toArray(), ship: s.pos.toArray() };
            }''')
            print('board', bd)
            # walk to the wheel and take the helm
            hm = await ev(page, '''() => {
              const g = window.__brinebound, P = g.player;
              P.local.set(0.3, 1.1, 3.0);
              window.__sim(0.1);
              const it = g.interaction;
              g.input.pressed.add('use');
              window.__sim(0.1);
              return { it, mode: P.mode };
            }''')
            print('helm', hm)
            await page.wait_for_timeout(500)
            await shot(page, 'p4_helm')
            # sail toward the X with a simple autopilot
            sail = await ev(page, '''() => {
              const g = window.__brinebound, s = g.sloop, m = g.map, I = g.input;
              const start = s.pos.toArray();
              let log = [];
              window.__sim(40, (g, t) => {
                const dx = m.x - s.pos.x, dz = m.z - s.pos.z, d = Math.hypot(dx, dz);
                const want = Math.atan2(-dx, -dz);
                let diff = want - s.heading; while (diff > Math.PI) diff -= 2*Math.PI; while (diff < -Math.PI) diff += 2*Math.PI;
                I.keys.delete('KeyA'); I.keys.delete('KeyD'); I.keys.delete('KeyW'); I.keys.delete('KeyS');
                if (diff > 0.08) I.keys.add('KeyA'); else if (diff < -0.08) I.keys.add('KeyD');
                if (d > 28) I.keys.add('KeyW'); else I.keys.add('KeyS');
                if (Math.floor(t) % 5 === 0 && Math.abs(t - Math.round(t)) < 0.02) log.push([t.toFixed(0), s.pos.x.toFixed(1), s.pos.z.toFixed(1), s.speed.toFixed(2), s.sailLvl.toFixed(2), d.toFixed(1), s.hp.toFixed(0)]);
              });
              ['KeyA','KeyD','KeyW','KeyS'].forEach(k => I.keys.delete(k));
              return { start, end: s.pos.toArray(), hp: s.hp, log, map: m };
            }''')
            print('sail', json.dumps(sail))
            await page.wait_for_timeout(500)
            await shot(page, 'p5_sailing')
            # map sheet
            await ev(page, '() => window.__brinebound.toggleSheet("map")')
            await page.wait_for_timeout(500)
            await shot(page, 'p6_map')
            await page.click('#bMapClose')
            await page.wait_for_timeout(300)
            # leave helm, go to the X, dig
            dig = await ev(page, '''() => {
              const g = window.__brinebound, P = g.player, w = g.world, m = g.map;
              g.input.pressed.add('use'); window.__sim(0.1);
              const modeAfterLeave = P.mode;
              // teleport next to the X
              P.mode = 'foot'; P.boardCD = 2;
              P.pos.set(m.x + 0.5, w.topSolid(m.x, m.z) + 1, m.z + 0.5 + 1.2); P.vel.set(0,0,0);
              window.__sim(0.3);
              const res = [];
              for (let k = 0; k < 4 && !m.dug; k++) {
                const ty = w.topSolid(m.x, m.z);
                window.__aimAt(m.x + 0.5, ty + 0.6, m.z + 0.5);
                g.input.mouseL = true;
                window.__sim(1.2, () => window.__aimAt(m.x + 0.5, w.topSolid(m.x, m.z) + 0.6, m.z + 0.5));
                res.push([ty, w.get(m.x, ty, m.z)]);
              }
              g.input.mouseL = false;
              return { modeAfterLeave, dug: m.dug, gold: g.gold, res, skeletons: g.enemies.list.length, pos: P.pos.toArray() };
            }''')
            print('dig', dig)
            await ev(page, '() => window.__sim(1.3)')
            await page.wait_for_timeout(400)
            await ev(page, '''() => { const g = window.__brinebound, P = g.player, s = g.enemies.list[0]; if (s) window.__aimAt(s.pos.x, s.pos.y + 1.2, s.pos.z); }''')
            await page.wait_for_timeout(400)
            await shot(page, 'p7_guards')
            # fight the guards
            fight = await ev(page, '''() => {
              const g = window.__brinebound, P = g.player;
              let t = 0;
              window.__sim(8, (g) => {
                const s = g.enemies.list.find(s => s.state !== 'dying');
                if (s) { window.__aimAt(s.pos.x, s.pos.y + 1.0, s.pos.z); g.input.mouseL = true; } else g.input.mouseL = false;
              });
              g.input.mouseL = false;
              return { left: g.enemies.list.length, hp: P.hp, alive: P.alive, gold: g.gold, hollow: !!g.hollow };
            }''')
            print('fight', fight)
            await ev(page, '() => window.__sim(2)')
            hol = await ev(page, '() => { const g = window.__brinebound; return g.hollow ? { pos: g.hollow.pos.toArray(), hp: g.hollow.hp, d: Math.hypot(g.hollow.pos.x - g.player.pos.x, g.hollow.pos.z - g.player.pos.z) } : null }')
            print('hollow', hol)
            print('\n'.join([l for l in logs if 'error' in l.lower()][-20:]))
            # save state for next test
            snap = await ev(page, '() => JSON.stringify(window.__brinebound.snapshot())')
            open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'snap1.json'), 'w').write(snap)
            await b.close()
    finally:
        srv.terminate()
if __name__ == '__main__':
    asyncio.run(main())
