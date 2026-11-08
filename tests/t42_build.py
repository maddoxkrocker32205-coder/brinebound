import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM
G = 'window.__brinebound'
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=1000, h=560)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'high'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            await page.evaluate(f'() => {{ const g = {G}; g.ui.toastsEl.style.display = "none"; g.time = 40; }}')
            # 1. real aiming: a floor, then a wall on its far edge, then stairs
            r = await page.evaluate(f'''() => {{ try {{ const g = {G}, P = g.player, w = g.world;
              let spot = null;
              for (const o of w.islands) {{
                if (spot || g.isProtected(Math.floor(o.x), 15, Math.floor(o.z)) || Math.hypot(o.x - w.spawn.x, o.z - w.spawn.z) < 25) continue;
                for (let k = 0; k < 300 && !spot; k++) {{ const x = Math.floor(o.x + (Math.random() - 0.5) * o.r * 1.2), z = Math.floor(o.z + (Math.random() - 0.5) * o.r * 1.2);
                  const hs = []; for (let dx = -1; dx <= 4; dx++) for (let dz = -1; dz <= 5; dz++) hs.push(w.groundUnder(x + dx + 0.5, 39, z + dz + 0.5));
                  const lo = Math.min(...hs), hi = Math.max(...hs);
                  let clear = true; for (let dx = -4; dx <= 8 && clear; dx++) for (let dz = -4; dz <= 10 && clear; dz++) for (let y = Math.floor(lo); y < Math.floor(lo) + 6; y++) {{ const id = w.get(x + dx, y, z + dz); if ([9, 10, 15, 16, 17, 18, 19, 20, 29, 30, 31, 45].includes(id)) {{ clear = false; break; }} }}
                  if (hi - lo < 1.0 && lo > 12.2 && clear) spot = {{ x, z, gy: lo }}; }}
              }}
              if (!spot) return {{ err: 'no spot' }};
              window.__spot = spot;
              g.selectSlot(3);
              const item = g.hotbar[g.sel];
              P.mode = 'foot'; P.pos.set(spot.x + 0.5, w.groundUnder(spot.x + 0.5, 39, spot.z + 4.5), spot.z + 4.5); P.vel.set(0,0,0);
              const aimAt = (tx, ty, tz) => {{ const e = P.eye(new P.pos.constructor()); const dx = tx - e.x, dy = ty - e.y, dz = tz - e.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz)); window.__sim(0.1); }};
              const res = {{ item }};
              g.builder.kind = 0; aimAt(spot.x + 0.5, spot.gy, spot.z + 1.5); res.floorPlan = g.builder.target && {{ ok: g.builder.target.ok, why: g.builder.target.why, cell: g.builder.target.cells[0] }};
              res.floorPlaced = g.builder.place();
              const fc = g.builder.target ? null : null;
              g.builder.kind = 1; aimAt(spot.x + 0.5, spot.gy + 0.2, spot.z + 1.1); res.wallPlan = g.builder.target && {{ ok: g.builder.target.ok, why: g.builder.target.why, cell: g.builder.target.cells[0] }};
              res.wallPlaced = g.builder.place();
              g.builder.kind = 4; aimAt(spot.x + 2.5, spot.gy, spot.z + 2.5); res.stairsPlan = g.builder.target && {{ ok: g.builder.target.ok, why: g.builder.target.why, cell: g.builder.target.cells[0] }};
              res.stairsPlaced = g.builder.place();
              res.planks = g.inv.plank;
              return res; }} catch (e) {{ return {{ err: String(e), stack: e.stack.split(String.fromCharCode(10)).slice(0, 5) }}; }} }}''')
            print('aimed building', r)
            # 2. a little hut from pieces, for the eye and for walking
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, s = window.__spot;
              if (!s) return null;
              for (let dx = -1; dx <= 3; dx++) for (let dz = -1; dz <= 5; dz++) for (let y = Math.floor(s.gy) + 1; y < Math.floor(s.gy) + 5; y++) w.set(s.x + dx, y, s.z + dz, 0);
              const y = Math.floor(s.gy + 0.55), X = s.x, Z = s.z;
              for (let dx = -2; dx <= 7; dx++) for (let dz = -3; dz <= 10; dz++) {{ for (let yy = y; yy < y + 6; yy++) w.set(X + dx, yy, Z + dz, 0); for (let yy = y - 3; yy < y; yy++) if (!w.get(X + dx, yy, Z + dz)) w.set(X + dx, yy, Z + dz, 3); }}
              const C = (m, f, wv, nv) => (!f && !wv && !nv) ? 0 : 128 + m * 32 + (f ? 16 : 0) + wv * 4 + nv;
              // 3x3 floor; walls: west wall x=X, north wall z=Z, east wall = west edge of X+3, south wall = north edge of Z+3 with a doorway
              for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) {{
                const west = i === 0 ? (k === 1 ? 2 : 1) : 0, north = k === 0 ? 1 : 0;
                w.set(X + i, y, Z + k, C(0, 1, west, north));
                w.set(X + i, y + 1, Z + k, C(0, 0, i === 0 ? 1 : 0, k === 0 ? 1 : 0));
              }}
              for (let k = 0; k < 3; k++) {{ w.set(X + 3, y, Z + k, C(0, 0, k === 1 ? 2 : 1, 0)); w.set(X + 3, y + 1, Z + k, C(0, 0, 1, 0)); }}
              for (let i = 0; i < 3; i++) {{ w.set(X + i, y, Z + 3, C(0, 0, 0, i === 1 ? 3 : 1)); w.set(X + i, y + 1, Z + 3, C(0, 0, 0, i === 1 ? 3 : 1)); }}
              // a pitched roof
              for (let k = -1; k <= 3; k++) {{ w.set(X - 1, y + 2, Z + k, 200 + 3); w.set(X, y + 2, Z + k, 200 + 3); w.set(X + 2, y + 2, Z + k, 200 + 1); w.set(X + 3, y + 2, Z + k, 200 + 1); w.set(X + 1, y + 3, Z + k, 208); }}
              // stone stairs up the side and a post
              w.set(X + 4, y, Z + 1, 192 + 4 + 2); w.set(X + 4, y, Z + 4, 209);
              w.processDirty(99);
              P.pos.set(X + 5.5, w.groundUnder(X + 5.5, 39, Z + 9.5), Z + 9.5); P.yaw = 0.45; P.pitch = -0.05; g.camMode = 'first'; g.selectSlot(0);
              window.__sim(0.3);
              return {{ y }}; }}''')
            print('hut', r)
            await page.wait_for_timeout(900); await shot(page, 'build_hut')
            # 3. walk: into the wall (blocked), through the doorway (passes), up the stairs
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, s = window.__spot; const X = s.x, Z = s.z;
              const walk = (x0, z0, yaw, secs) => {{ P.pos.set(x0, w.groundUnder(x0, 39, z0), z0); P.vel.set(0,0,0); P.yaw = yaw; g.input.keys.add('KeyW'); window.__sim(secs); g.input.keys.clear(); return [P.pos.x, P.pos.y, P.pos.z]; }};
              const wall = walk(X + 0.5, Z + 5, 0, 1.5);              // toward the south wall (no door at x+0.5)
              const door = walk(X + 1.5, Z + 5, 0, 1.6);              // through the doorway
              const st = walk(X + 4.5, Z - 0.6, Math.PI, 1.5);       // up the stone stairs, climbing south
              window.__dbg = {{ y: P.pos.y.toFixed(2), tb: P.terrainBlocked(), boxes: w.boxes(P.pos.x - 0.3, P.pos.y - 0.2, P.pos.z - 0.6, P.pos.x + 0.3, P.pos.y + 1.75, P.pos.z + 0.6, []).map(b => b.map(v => +v.toFixed(2))), probes: [[0.255, 0.255], [-0.255, 0.255], [0.255, 0.4], [-0.255, 0.4]].map(([a, c]) => w.groundProbe(P.pos.x + a, P.pos.z + c, P.pos.y, 0.62, 1.75)) }};
              return {{ wallZ: wall[2].toFixed(2), wallLine: Z + 3, doorZ: door[2].toFixed(2), stairsTop: st[1].toFixed(2), stairsZ: st[2].toFixed(2), dbg: window.__dbg, floorY: (Math.floor(s.gy + 0.55) + 0.16).toFixed(2) }}; }}''')
            print('walking', r)
            # 4. knock a wall out with the hammer: the floor stays
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, s = window.__spot; const X = s.x, Z = s.z, y = Math.floor(s.gy + 0.55);
              const before = w.get(X, y, Z + 1);
              g.breakBlock(X, y, Z + 1, before, 'west');
              return {{ before, after: w.get(X, y, Z + 1) }}; }}''')
            print('break west window', r)
            print([l for l in logs if 'error' in l.lower()][-6:])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
