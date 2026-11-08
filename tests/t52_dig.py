import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM
G = 'window.__brinebound'
# dig a shaft and a tunnel the way a player would, and check the camera never sees through the rock
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=900, h=520)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'high'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            await page.evaluate(f'() => {{ const g = {G}; g.ui.toastsEl.style.display = "none"; g.time = 40; }}')
            # find a hill: highest solid ground within 30 blocks of the player, away from water
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world; let best = null;
              for (let z = 10; z < 370; z += 2) for (let x = 10; x < 370; x += 2) {{ const y = w.topSolid(x, z);
                let ok = y > 14 && [1, 2, 3, 4].includes(w.get(x, y, z)); for (let a = -4; a <= 8 && ok; a++) for (let c = -3; c <= 3 && ok; c++) {{ const t = w.topSolid(x + a, z + c); if (t < y - 2 || t > y + 3 || ![1, 2, 3, 4].includes(w.get(x + a, t, z + c))) ok = false; }}
                if (ok && (!best || y > best.y)) best = {{ x, z, y }}; }}
              if (!best) return null;
              // shaft: dig 5 blocks straight down under the player
              P.pos.set(best.x + 0.5, best.y + 1, best.z + 0.5); P.vel.set(0, 0, 0);
              for (let k = 0; k < 5; k++) w.set(best.x, best.y - k, best.z, 0, true);
              window.__sim(2.5, () => {{}});
              w.buildDirty && w.buildDirty(99);
              return {{ hill: best, feet: +P.pos.y.toFixed(2) }}; }}''')
            print('shaft', r)
            if not r: return
            hill = r['hill']
            await page.evaluate(f'() => {{ const g = {G}; for (let i = 0; i < 40; i++) g.world.update ? 0 : 0; }}')
            await page.wait_for_timeout(600)
            for i, (yaw, pitch, dx, dz) in enumerate([(0, 0, 0, -0.2), (1.57, 0.2, -0.2, 0), (3.14, -0.3, 0, 0.2), (0.8, 0.6, -0.15, -0.15), (0, -1.3, 0, 0)]):
                await page.evaluate(f'''() => {{ const g = {G}, P = g.player; P.pos.x = {hill['x']} + 0.5 + {dx}; P.pos.z = {hill['z']} + 0.5 + {dz}; P.yaw = {yaw}; P.pitch = {pitch}; window.__sim(0.2, () => {{}}); }}''')
                await page.wait_for_timeout(400)
                await shot(page, f't52_shaft{i}')
            # tunnel: dig 6 blocks sideways from the shaft bottom, 2 tall
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, h = {hill};
              const fy = Math.floor(P.pos.y + 0.01);
              for (let k = 1; k <= 6; k++) {{ w.set(h.x + k, fy, h.z, 0, true); w.set(h.x + k, fy + 1, h.z, 0, true); }}
              P.pos.set(h.x + 6.5 + 0.2, fy, h.z + 0.5); P.yaw = -Math.PI / 2; P.pitch = 0;
              window.__sim(0.6, () => {{}});
              return {{ feet: +P.pos.y.toFixed(2), x: +P.pos.x.toFixed(2) }}; }}''')
            print('tunnel', r)
            await page.wait_for_timeout(700)
            for i, (yaw, pitch, dz) in enumerate([(-1.57, 0, 0), (-1.57, 0.4, 0.19), (0, 0, -0.19), (3.14, 0.5, 0.19), (-1.57, -0.15, 0)]):
                await page.evaluate(f'''() => {{ const g = {G}, P = g.player; P.pos.z = {hill['z']} + 0.5 + {dz}; if ({i} === 4) P.pos.x -= 3.5; P.yaw = {yaw}; P.pitch = {pitch}; window.__sim(0.2, () => {{}}); }}''')
                await page.wait_for_timeout(400)
                await shot(page, f't52_tunnel{i}')
            # how much sky colour does the view contain? (seeing through rock shows sky/sea)
            print('errors', [l for l in logs if 'error' in l.lower()][:5])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
