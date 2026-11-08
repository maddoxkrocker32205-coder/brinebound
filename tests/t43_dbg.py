import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM
G = 'window.__brinebound'
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=800, h=450)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'low'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world;
              const X = 218, Z = 183, y = 14;
              w.set(X + 4, y, Z + 1, 192 + 4 + 2); w.processDirty(99);
              const out = {{ ground: [] }};
              for (let z = 182.4; z < 186; z += 0.2) out.ground.push([z.toFixed(1), w.groundUnder(X + 4.5, 20, z).toFixed(2)]);
              P.mode = 'foot'; P.pos.set(X + 4.5, w.groundUnder(X + 4.5, 39, Z + 1.1), Z + 1.1); P.vel.set(0, 0, 0); P.onGround = true;
              out.start = [P.pos.y.toFixed(3), P.pos.z.toFixed(3), P.collides()];
              const log = [];
              for (let k = 0; k < 8; k++) {{ const hit = P.stepH(2, 0.12); log.push([hit, P.pos.y.toFixed(3), P.pos.z.toFixed(3), P.onGround, P.terrainBlocked()]); P.onGround = true; }}
              out.log = log;
              out.boxes = w.boxes(P.pos.x - 0.3, P.pos.y - 1, P.pos.z - 0.6, P.pos.x + 0.3, P.pos.y + 1.75, P.pos.z + 0.6, []).map(b => b.map(v => +v.toFixed(2)));
              return out; }}''')
            print(r['start']); print(r['ground'])
            for l in r['log']: print('  ', l)
            print(r['boxes'])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
