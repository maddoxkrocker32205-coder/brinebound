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
            # 1. hook a high point on the rock island from below and get hauled up
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, o = w.islands.find(o => o.type === 'rock');
              let top = null; for (let k = 0; k < 600; k++) {{ const x = o.x + (Math.random()-0.5) * o.r, z = o.z + (Math.random()-0.5) * o.r; const y = w.groundUnder(x, 39, z); if (!top || y > top.y) top = {{ x, y, z }}; }}
              const a = Math.random() * 6.28; let sx = top.x + Math.cos(a) * 12, sz = top.z + Math.sin(a) * 12; let sy = w.groundUnder(sx, 39, sz);
              P.mode = 'foot'; P.pos.set(sx, sy, sz); P.vel.set(0,0,0);
              const dx = top.x - sx, dy = top.y + 0.3 - (sy + 1.6), dz = top.z - sz;
              P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
              g.selectSlot(2); const item = g.hotbar[g.sel];
              g.input.pressed.add('place'); let states = new Set(), maxY = P.pos.y, maxV = 0;
              window.__sim(4, (g) => {{ states.add(g.hook.state); maxY = Math.max(maxY, P.pos.y); maxV = Math.max(maxV, P.vel.length()); }});
              return {{ item, top: top.y.toFixed(1), start: sy.toFixed(1), rose: (maxY - sy).toFixed(1), end: P.pos.y.toFixed(1), maxV: maxV.toFixed(1), states: [...states], distTop: Math.hypot(P.pos.x - top.x, P.pos.z - top.z).toFixed(1) }}; }}''')
            print('haul up', r)
            # 2. from the beach, hook your own sloop and land on its deck
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, s = g.sloop;
              const side = {{ x: Math.cos(s.heading), z: -Math.sin(s.heading) }};
              const px = s.pos.x + side.x * 14, pz = s.pos.z + side.z * 14;
              P.mode = 'foot'; P.pos.set(px, Math.max(11.2, w.groundUnder(px, 30, pz)), pz); P.vel.set(0,0,0);
              const tx = s.pos.x, ty = s.pos.y + 1.6, tz = s.pos.z, dx = tx - px, dy = ty - (P.pos.y + 1.6), dz = tz - pz;
              P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
              g.selectSlot(2); g.input.pressed.add('place'); let st = new Set();
              window.__sim(4, (g) => {{ st.add(g.hook.state); if (P.mode === 'deck') return false; }});
              return {{ mode: P.mode, states: [...st], hookState: g.hook.state }}; }}''')
            print('hook the sloop', r)
            await page.evaluate(f'() => {{ const g = {G}; g.camMode = "third"; }}')
            # 3. a swing in progress, for the eye
            await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, o = w.islands.find(o => o.type === 'forest') || w.islands[1];
              P.mode = 'foot'; P.pos.set(o.x + o.r * 0.9, w.groundUnder(o.x + o.r * 0.9, 39, o.z), o.z); P.vel.set(0,0,0);
              P.yaw = Math.PI / 2; P.pitch = 0.35; g.selectSlot(2); g.input.pressed.add('place'); window.__sim(0.7); }}''')
            await page.wait_for_timeout(400); await shot(page, 'hook_swing')
            print([l for l in logs if 'error' in l.lower()][-6:])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
