import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM
VIEWS = [
  ('sm_skull2', '''() => { const g = window.__brinebound, s = g.world.sites.ribs; return [s.x + 2, 26, s.z + 24, s.x + 2, 15, s.z]; }'''),
  ('sm_skull3', '''() => { const g = window.__brinebound, s = g.world.sites.ribs; return [s.x + 16, 19, s.z + 7, s.x + 10, 15, s.z]; }'''),
  ('sm_tree', '''() => { const g = window.__brinebound, w = g.world, o = w.islands.find(o => o.type === 'forest'); for (let k = 0; k < 4000; k++) { const x = Math.floor(o.x - o.r + (k * 37) % (o.r * 2)), z = Math.floor(o.z - o.r + (k * 53) % (o.r * 2)); const y = w.topSolid(x, z); if (w.get(x, y - 6, z) === 5) { let b = y - 6; while (w.get(x, b - 1, z) === 5) b--; return [x + 5.5, b + 1.9, z + 4.5, x, b + 2.2, z]; } } return [0,0,0,1,1,1]; }'''),
  ('sm_spires', '''() => { const g = window.__brinebound, o = g.world.islands.find(o => o.type === 'rock'); return [o.x + 6, 20, o.z + o.r - 2, o.x, 22, o.z]; }'''),
]
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=1200, h=675)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'medium'}))")
            t0 = __import__('time').time()
            await load(page)
            print('loaded in', round(__import__('time').time() - t0, 1), 's')
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            await page.evaluate('() => { const g = window.__brinebound; g.ui.toastsEl.style.display = "none"; document.getElementById("hud").style.display = "none"; g.time = 40; }')
            for name, fn in VIEWS:
                r = await page.evaluate('''(fn) => { const g = window.__brinebound; const v = (0, eval)(fn)(); g.state = 'loading';
                  g.world.buildNear(v[3], v[5], 90); g.camera.position.set(v[0], v[1], v[2]); g.camera.lookAt(v[3], v[4], v[5]); return v; }''', fn)
                await page.wait_for_timeout(900)
                await shot(page, name)
            st = await page.evaluate('''() => { const g = window.__brinebound, w = g.world; const t0 = performance.now(); let n = 0;
              for (let k = 0; k < 24; k++) { w.buildChunk(200 + k); n++; } return ((performance.now() - t0) / n).toFixed(1) + ' ms per chunk'; }''')
            print(st)
            print([l for l in logs if 'error' in l.lower()][-5:])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
