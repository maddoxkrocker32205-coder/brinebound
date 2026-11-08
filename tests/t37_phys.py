import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM
G = 'window.__brinebound'
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=1000, h=560)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'medium'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            await page.evaluate(f'() => {{ const g = {G}; g.ui.toastsEl.style.display = "none"; g.time = 40; }}')
            # 1. the uphill walk that used to stop at a tree trunk
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, o = w.islands.find(o => o.type === 'rock');
              const x = o.x + o.r * 0.85, z = o.z; P.mode = 'foot'; P.pos.set(x, w.groundUnder(x, 40, z), z); P.vel.set(0,0,0);
              P.yaw = Math.atan2(-(o.x - x), -(o.z - z)); P.pitch = 0; let stuck = 0, last = P.pos.clone(), y0 = P.pos.y, maxY = y0;
              g.input.keys.add('KeyW');
              window.__sim(5, (g, t) => {{ if (P.pos.distanceTo(last) < 0.01) stuck++; last.copy(P.pos); maxY = Math.max(maxY, P.pos.y); }});
              g.input.keys.clear();
              return {{ climbed: (maxY - y0).toFixed(2), stuckFrames: stuck, end: [P.pos.x.toFixed(1), P.pos.z.toFixed(1)] }}; }}''')
            print('walk uphill', r)
            # 2. fell a tree: find a forest island log with ground under it
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world;
              let tree = null;
              for (const o of w.islands) {{ if (o.type !== 'forest' && o.type !== 'palm') continue;
                for (let k = 0; k < 400 && !tree; k++) {{ const x = Math.floor(o.x + (Math.random() - 0.5) * o.r * 1.4), z = Math.floor(o.z + (Math.random() - 0.5) * o.r * 1.4);
                  for (let y = 30; y > 12; y--) {{ const id = w.get(x, y, z); if ((id === 5 || id === 7) && Math.random() < 0.5 && w.get(x, y - 1, z) !== id && w.get(x, y + 1, z) === id) {{ tree = {{ x, y, z, id }}; break; }} }} }}
                if (tree) break; }}
              if (!tree) return {{ err: 'no tree' }};
              let trunk = 0; for (let y = tree.y; y < tree.y + 12; y++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (w.get(tree.x + dx, y, tree.z + dz) === tree.id) trunk++;
              P.pos.set(tree.x + 0.5, w.groundUnder(tree.x + 0.5, tree.y + 2, tree.z + 2.2), tree.z + 2.2); P.vel.set(0,0,0); P.yaw = 0; P.pitch = 0;
              w.processDirty(99);
              window.__tree = tree;
              const wood0 = g.inv.wood || 0;
              g.breakBlock(tree.x, tree.y, tree.z, tree.id);
              let fell = 0, maxF = 0, maxD = 0, shatterT = null, t0 = 0;
              window.__sim(5, (g, t) => {{ maxF = Math.max(maxF, g.physics.fallers.length); maxD = Math.max(maxD, g.physics.debris.list.length); if (g.physics.fallers.length) fell = 1; if (fell && !g.physics.fallers.length && shatterT === null) shatterT = t; }});
              let left = 0; for (let y = tree.y; y < tree.y + 12; y++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {{ const id = w.get(tree.x + dx, y, tree.z + dz); if (id === tree.id) left++; }}
              return {{ tree, trunkAbove: trunk - 1, fell, maxF, maxDebris: maxD, shatterT: shatterT && shatterT.toFixed(2), woodGained: (g.inv.wood || 0) - wood0, leftNearby: left }}; }}''')
            print('fell tree', r)
            await page.evaluate(f'() => {{ const g = {G}; g.camMode = "third"; }}')
            await page.wait_for_timeout(500); await shot(page, 'ph_tree')
            # 3. a keg against a plank tower on a single post: the blast, the crater, the collapse
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, sp = w.spawn;
              const o = w.islands.find(o => o.type === 'palm' && Math.hypot(o.x - sp.x, o.z - sp.z) > 40) || w.islands[2];
              const x = Math.floor(o.x), z = Math.floor(o.z); const gy = Math.floor(w.groundUnder(x + 0.5, 40, z + 0.5) + 0.2);
              for (let y = gy; y < gy + 3; y++) w.set(x, y, z, 9);                    // a post
              for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let y = gy + 3; y < gy + 6; y++) if (Math.abs(dx) + Math.abs(dz) === 2 || y === gy + 3 || y === gy + 5) w.set(x + dx, y, z + dz, 15);   // a little room on top
              w.set(x + 1, gy, z, 45);                                                 // the keg by the post
              w.processDirty(99);
              P.pos.set(x + 0.5, w.groundUnder(x + 0.5, 40, z + 9), z + 9); P.vel.set(0,0,0); P.yaw = 0; P.pitch = 0.2;
              const hp0 = P.hp; let cnt0 = 0; for (let y = gy; y < gy + 7; y++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (w.get(x + dx, y, z + dz)) cnt0++;
              g.lightKeg(x + 1, gy, z);
              let boom = null, maxF = 0, maxD = 0, maxPuff = 0, vmax = 0;
              window.__sim(5, (g, t) => {{ if (boom === null && w.get(x + 1, gy, z) !== 45) boom = t; maxF = Math.max(maxF, g.physics.fallers.length); maxD = Math.max(maxD, g.physics.debris.list.length); maxPuff = Math.max(maxPuff, g.physics.puffs.list.length); vmax = Math.max(vmax, Math.hypot(P.vel.x, P.vel.z)); }});
              let cnt1 = 0; for (let y = gy; y < gy + 7; y++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (w.get(x + dx, y, z + dz) && !(w.get(x+dx,y,z+dz) <= 4)) cnt1++;
              window.__site = {{ x, gy, z }};
              return {{ boomAt: boom && boom.toFixed(2), blocksBefore: cnt0, crispAfter: cnt1, maxFallers: maxF, maxDebris: maxD, maxPuffs: maxPuff, playerHurt: (hp0 - P.hp).toFixed(0), playerPush: vmax.toFixed(1) }}; }}''')
            print('keg + collapse', r)
            # 4. stand next to a keg: thrown through the air
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, s = window.__site;
              const x = s.x + 4, z = s.z + 4, gy = Math.floor(w.groundUnder(x + 0.5, 40, z + 0.5) + 0.2);
              w.set(x, gy, z, 45); w.processDirty(9);
              P.hp = 100; P.pos.set(x + 2.2, w.groundUnder(x + 2.2, 40, z + 0.5), z + 0.5); P.vel.set(0,0,0);
              g.physics.ignite(x, gy, z, 0.05); let maxH = 0, y0 = P.pos.y, dmax = 0;
              window.__sim(2, (g) => {{ maxH = Math.max(maxH, P.pos.y - y0); dmax = Math.max(dmax, Math.hypot(P.pos.x - x - 2.7, P.pos.z - z - 0.5)); }});
              return {{ airHeight: maxH.toFixed(2), thrown: dmax.toFixed(1), hp: P.hp.toFixed(0) }}; }}''')
            print('keg knockback', r)
            await page.evaluate(f'''() => {{ const g = {G}, P = g.player, s = window.__site; P.hp = 100; P.pos.set(s.x + 0.5, g.world.groundUnder(s.x + 0.5, 40, s.z + 8), s.z + 8); P.yaw = 0; P.pitch = -0.15;
              g.world.set(s.x - 2, s.gy, s.z + 2, 45); g.world.processDirty(9); g.physics.ignite(s.x - 2, s.gy, s.z + 2, 0.05); window.__sim(0.25); }}''')
            await page.wait_for_timeout(300); await shot(page, 'ph_blast')
            # 5. cost: a pile of debris
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, ph = g.physics;
              for (let k = 0; k < 400; k++) ph.debris.spawn(P.pos.x + (Math.random()-0.5)*8, P.pos.y + 3 + Math.random()*4, P.pos.z - 6 + (Math.random()-0.5)*8, 0, 0, 0, 0.3, 0.3, 0.3, 0x886644, k % 2 ? 'wood' : 'stone');
              const t0 = performance.now(); let n = 0; while (n < 60) {{ ph.update(1/30); n++; }} const ms = (performance.now() - t0) / n;
              const asleep = ph.debris.list.filter(d => d.sleep).length;
              return {{ msPerStep: ms.toFixed(2), live: ph.debris.list.length, asleep }}; }}''')
            print('debris cost', r)
            await page.wait_for_timeout(300); await shot(page, 'ph_pile')
            print([l for l in logs if 'error' in l.lower()][-6:])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
