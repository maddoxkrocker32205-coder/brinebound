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
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'medium'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            await page.evaluate(f'() => {{ const g = {G}; g.ui.toastsEl.style.display = "none"; g.time = 40; }}')
            # 1. walk up and down the rock island's slopes: feet stay on the ground, no getting stuck
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, o = w.islands.find(o => o.type === 'rock');
              const x = o.x + o.r * 0.85, z = o.z; P.mode = 'foot'; P.pos.set(x, w.groundUnder(x, 40, z), z); P.vel.set(0,0,0);
              P.yaw = Math.atan2(-(o.x - x), -(o.z - z)); P.pitch = 0;
              let maxGap = 0, ys = [], stuck = 0, last = P.pos.clone();
              g.input.keys.add('KeyW');
              window.__sim(5, (g, t) => {{ const gr = w.groundUnder(P.pos.x, P.pos.y, P.pos.z); if (P.onGround) maxGap = Math.max(maxGap, Math.abs(P.pos.y - gr)); ys.push(P.pos.y);
                if (P.pos.distanceTo(last) < 0.01) stuck++; last.copy(P.pos); }});
              g.input.keys.clear();
              return {{ start: [x.toFixed(1), z.toFixed(1)], end: [P.pos.x.toFixed(1), P.pos.y.toFixed(2), P.pos.z.toFixed(1)], climbed: (Math.max(...ys) - ys[0]).toFixed(2), maxGap: maxGap.toFixed(3), stuckFrames: stuck, onGround: P.onGround }}; }}''')
            print('walk uphill', r)
            await page.evaluate(f'() => {{ const g = {G}; g.camMode = "third"; }}')
            await page.wait_for_timeout(800); await shot(page, 'mv_slope')
            # 2. sprint and slide down the slope
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player; P.yaw += Math.PI; g.input.keys.add('KeyW'); g.input.keys.add('ShiftLeft');
              window.__sim(0.8); const v0 = Math.hypot(P.vel.x, P.vel.z); g.input.pressed.add('slide'); let maxV = 0, slideT = 0;
              window.__sim(1.6, (g) => {{ maxV = Math.max(maxV, Math.hypot(P.vel.x, P.vel.z)); if (P.slide > 0) slideT += 1/30; }});
              g.input.keys.clear(); return {{ runSpeed: v0.toFixed(1), maxSlideSpeed: maxV.toFixed(1), slideTime: slideT.toFixed(2), state: P.animState }}; }}''')
            print('slide', r)
            # 3. mantle: a two-block wall of planks in front, jump at it
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, sp = w.spawn;
              const x = Math.floor(sp.x) + 4, z = Math.floor(sp.z) + 4; let gy = w.groundUnder(x + 0.5, 30, z + 2.5);
              P.pos.set(x + 0.5, gy, z + 2.6); P.vel.set(0, 0, 0); P.yaw = 0; P.pitch = 0;
              const by = Math.floor(gy + 0.3); for (let dx = -1; dx <= 1; dx++) {{ w.set(x + dx, by, z, 9); w.set(x + dx, by + 1, z, 9); }}
              w.processDirty(9);
              g.input.keys.add('KeyW'); g.input.keys.add('Space'); let mantled = false;
              window.__sim(1.6, (g) => {{ if (P.mantle) mantled = true; }});
              g.input.keys.clear();
              return {{ mantled, feet: P.pos.y.toFixed(2), wallTop: by + 2, onTop: P.pos.y > by + 1.9 }}; }}''')
            print('mantle 2 blocks', r)
            # 4. dig into the ground at your feet: the hole is real, you drop into it
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, o = w.islands[1];
              const x = Math.floor(o.x), z = Math.floor(o.z); const gy = w.groundUnder(x + 0.5, 40, z + 0.5);
              P.pos.set(x + 0.5, gy, z + 0.5); P.vel.set(0,0,0); g.selectSlot(1);
              let dug = 0, y0 = P.pos.y;
              for (let k = 0; k < 3; k++) {{ g.input.mouseL = true; let got = false; const before = w.edits.size;
                window.__sim(4, (g) => {{ P.yaw = 0; P.pitch = -1.45; if (w.edits.size > before) {{ got = true; return false; }} }}); g.input.mouseL = false; if (got) dug++; window.__sim(0.6); }}
              return {{ dug, sank: (y0 - P.pos.y).toFixed(2), onGround: P.onGround }}; }}''')
            print('dig down', r)
            await page.evaluate(f'() => {{ const g = {G}; g.camMode = "first"; }}')
            await page.evaluate(f'() => {{ const g = {G}, P = g.player; P.pitch = -0.6; g.input.mouseL = false; }}')
            await page.wait_for_timeout(900); await shot(page, 'mv_dig')
            # 5. pile up sand: the ground rises in a smooth mound
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, sp = w.spawn;
              const x = Math.floor(sp.x) - 6, z = Math.floor(sp.z) - 3; const gy = Math.floor(w.groundUnder(x + 0.5, 40, z + 0.5) + 0.3);
              const h0 = w.groundUnder(x + 0.5, 40, z + 0.5); w.set(x, gy, z, 3); w.set(x + 1, gy, z, 3); w.set(x, gy, z + 1, 3); w.set(x, gy + 1, z, 3); w.processDirty(12);
              const h1 = w.groundUnder(x + 0.5, 40, z + 0.5); return {{ before: h0.toFixed(2), after: h1.toFixed(2) }}; }}''')
            print('sand mound', r)
            # 6. a skeleton crosses rough ground to reach you
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, o = w.islands.find(o => o.type === 'rock');
              const x = o.x + o.r * 0.5, z = o.z + 2; P.pos.set(x, w.groundUnder(x, 40, z), z); P.vel.set(0,0,0);
              g.enemies.spawnNear(x, z, 1, 6, 8, {{ kind: 'guard' }}); const s = g.enemies.list[g.enemies.list.length - 1];
              const d0 = Math.hypot(s.pos.x - P.pos.x, s.pos.z - P.pos.z); let maxGap = 0;
              window.__sim(6, (g) => {{ P.hp = 100; if (s.state === 'walk' && s.onGround) maxGap = Math.max(maxGap, Math.abs(s.pos.y - w.groundUnder(s.pos.x, s.pos.y, s.pos.z))); }});
              return {{ d0: d0.toFixed(1), d1: Math.hypot(s.pos.x - P.pos.x, s.pos.z - P.pos.z).toFixed(1), maxGap: maxGap.toFixed(3) }}; }}''')
            print('skeleton chase', r)
            print([l for l in logs if 'error' in l.lower()][-5:])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
