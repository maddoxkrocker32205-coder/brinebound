import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM
G = 'window.__brinebound'
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=640, h=360)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'low'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            r = await page.evaluate(f'''() => {{ const g = {G}, w = g.world, s = g.sloop; const vals = []; for (let k = 0; k < 10; k++) vals.push(w.surf[Math.floor(s.pos.x + k * 15) + Math.floor(s.pos.z) * 384]);
              let hist = {{}}; for (let i = 0; i < w.surf.length; i += 97) {{ const v = w.surf[i]; hist[v] = (hist[v] || 0) + 1; }}
              return {{ type: w.surf.constructor.name, len: w.surf.length, sloop: [s.pos.x, s.pos.z], vals, hist }}; }}''')
            print(r)
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
