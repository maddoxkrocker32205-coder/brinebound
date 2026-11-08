import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM
G = 'window.__brinebound'
# Underground: walk, sprint, crouch and jump into the walls of dug tunnels and rooms. The body must never
# get into the ground: report the deepest any part of the body got past a tunnel wall into solid rock.
SETUP = '''() => {
  const g = window.__brinebound, w = g.world, P = g.player;
  // a solid hill of stone and dirt on the beach-side plain, well clear of the trading post
  let best = null;
  for (let r = 14; r < 150 && !best; r += 4) for (let a = 0; a < 6.28 && !best; a += 0.25) {
    const x = Math.floor(w.spawn.x + Math.cos(a) * r), z = Math.floor(w.spawn.z + Math.sin(a) * r);
    let ok = true;
    for (let dz = -8; dz <= 8 && ok; dz++) for (let dx = -8; dx <= 8 && ok; dx++) if (!w.solid(x + dx, 13, z + dz)) ok = false;
    if (ok) best = { x, z };
  }
  if (!best) return null;
  const { x, z } = best, yf = 15;
  for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) for (let y = 13; y < 24; y++) w.set(x + dx, y, z + dz, (y + dx + dz) % 3 ? 4 : 2, true);
  const air = (ax, ay, az) => w.set(ax, ay, az, 0, true);
  // a 3 x 3 room, 2 high, with tunnels: 1 wide east, 2 wide west, 1 wide and 1 high (a crawl) north, and a diagonal-ish dogleg south
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (let y = yf; y < yf + 2; y++) air(x + dx, y, z + dz);
  for (let k = 2; k <= 6; k++) for (let y = yf; y < yf + 2; y++) air(x + k, y, z);
  for (let k = 2; k <= 6; k++) for (let y = yf; y < yf + 2; y++) { air(x - k, y, z); air(x - k, y, z + 1); }
  for (let k = 2; k <= 6; k++) air(x, yf, z - k);
  for (let k = 2; k <= 4; k++) for (let y = yf; y < yf + 2; y++) { air(x, y, z + k); air(x + (k - 1), y, z + k); }
  w.processDirty(400);
  return { x, z, yf };
}'''
RUN = '''([T, yaw, keys, secs, crouch, jump, sx, sz]) => {
  const g = window.__brinebound, w = g.world, P = g.player, I = g.input;
  P.mode = 'foot'; P.ship = null; P.vel.set(0, 0, 0); P.slide = 0; P.mantle = null; P.climb = false;
  P.pos.set(T.x + 0.5 + (sx || 0), T.yf + 0.01, T.z + 0.5 + (sz || 0)); P.yaw = yaw; P.pitch = 0; P.onGround = true;
  P.crouch = !!crouch;
  let deep = 0, deepC = 0, at = null, maxY = -1e9, minY = 1e9;
  // how far is a point inside solid rock (0 when in air): distance to the nearest air cell's face, per axis
  const depth = (px, py, pz) => {
    const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);
    if (!w.solid(bx, by, bz)) return 0;
    let d = 9;
    for (const [ox, oy, oz] of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0,-1,0]]) {
      if (w.solid(bx + ox, by + oy, bz + oz)) continue;
      const f = ox > 0 ? bx + 1 - px : ox < 0 ? px - bx : oz > 0 ? bz + 1 - pz : oz < 0 ? pz - bz : oy > 0 ? by + 1 - py : py - by;
      d = Math.min(d, f);
    }
    return d === 9 ? 1 : d;
  };
  window.__sim(secs, (g2, t) => {
    I.keys.clear(); for (const k of keys) I.keys.add(k);
    if (jump && Math.floor(t * 3) % 3 === 0) I.keys.add('Space');
    if (crouch) { P.crouch = true; }
    const h = P.height();
    for (const [ox, oz] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) for (const hy of [0.25, h * 0.5, h - 0.15]) {
      const d = depth(P.pos.x + ox, P.pos.y + hy, P.pos.z + oz);
      if (!ox && !oz && d > deepC) deepC = d;
      if (d > deep) { deep = d; at = [+(P.pos.x - T.x).toFixed(2), +(P.pos.y - T.yf).toFixed(2), +(P.pos.z - T.z).toFixed(2), ox, oz, hy.toFixed(2)]; }
    }
    maxY = Math.max(maxY, P.pos.y); minY = Math.min(minY, P.pos.y);
  });
  I.keys.clear(); P.crouch = false;
  return { deep: +deep.toFixed(3), center: +deepC.toFixed(3), at, end: [+(P.pos.x - T.x).toFixed(2), +(P.pos.y - T.yf).toFixed(2), +(P.pos.z - T.z).toFixed(2)], rise: +(maxY - T.yf).toFixed(2), drop: +(minY - T.yf).toFixed(2) };
}'''
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=800, h=450)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'low'}))")
            await load(page)
            await page.evaluate(SIM)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")')
            await page.wait_for_function(f'{G}.state === "play"', timeout=30000)
            await page.wait_for_timeout(800)
            T = await page.evaluate(SETUP)
            print('hill', T)
            if not T: return
            import math
            worst = 0; bad = []
            cases = []
            # straight at every wall of the room, at the ends of every tunnel, diagonally into corners
            for name, yaw, sx, sz in [('room E wall', -math.pi/2, 0, 0.9), ('room S wall', math.pi, 0.9, 0), ('room W wall', math.pi/2, 0, -0.9), ('room N wall', 0, 0.9, 0),
                                      ('east tunnel end', -math.pi/2, 0, 0), ('west tunnel end', math.pi/2, 0, 0.5), ('north crawl end', 0, 0, 0), ('south dogleg', math.pi, 0, 0),
                                      ('corner NE', -math.pi/4, 0, 0), ('corner SW', math.pi*0.75, 0, 0), ('corner SE', -math.pi*0.75, 0, 0), ('tunnel side wall E', -math.pi/2 + 1.2, 3, 0)]:
                for mode, keys, crouch, jump in [('walk', ['KeyW'], False, False), ('sprint', ['KeyW', 'ShiftLeft'], False, False), ('crouch', ['KeyW'], True, False), ('jump', ['KeyW'], False, True), ('strafe', ['KeyD', 'KeyW'], False, False)]:
                    r = await page.evaluate(RUN, [T, yaw, keys, 2.5, crouch, jump, sx, sz])
                    cases.append((name, mode, r))
                    if r['deep'] > worst: worst = r['deep']
                    if r['deep'] > 0.45 or r['center'] > 0.02 or r['drop'] < -0.4 or r['rise'] > 2.2: bad.append((name, mode, r))
            for c in cases[:6]: print(' ', c)
            print('cases', len(cases), 'worst edge depth into a rock cell', worst, 'worst center', max(c[2]['center'] for c in cases), 'lowest', min(c[2]['drop'] for c in cases), 'highest', max(c[2]['rise'] for c in cases))
            print('BAD' if bad else 'OK', len(bad))
            for x in bad[:20]: print('  INTO ROCK', x)
            # buried where you stand (a block put down on you in a tunnel): out into the tunnel, not up through the hill
            r = await page.evaluate(f'''([T]) => {{ const g = {G}, w = g.world, P = g.player;
              P.pos.set(T.x + 4.5, T.yf + 0.01, T.z + 0.5); P.vel.set(0, 0, 0); P.crouch = false;
              w.set(T.x + 4, T.yf, T.z, 4, true); w.set(T.x + 4, T.yf + 1, T.z, 4, true);
              window.__sim(0.6);
              const out = [+(P.pos.x - T.x).toFixed(2), +(P.pos.y - T.yf).toFixed(2), +(P.pos.z - T.z).toFixed(2)];
              w.set(T.x + 4, T.yf, T.z, 0, true); w.set(T.x + 4, T.yf + 1, T.z, 0, true);
              return {{ out, inRock: w.solid(Math.floor(P.pos.x), Math.floor(P.pos.y + 0.3), Math.floor(P.pos.z)) }}; }}''', [T])
            print('buried in the tunnel ->', r, 'OK' if not r['inRock'] and abs(r['out'][1]) < 0.5 else 'BAD')
            await page.evaluate(f'''([T]) => {{ const P = {G}.player; P.pos.set(T.x + 0.5, T.yf + 0.01, T.z + 0.5); P.yaw = -Math.PI / 4; P.pitch = -0.1; }}''', [T])
            await page.evaluate('() => window.__sim(0.3)')
            await page.wait_for_timeout(500)
            await page.screenshot(path=f'{SHOTS}/t64_room.png')
            print('errors', [l for l in logs if 'error' in l.lower()][:5])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
