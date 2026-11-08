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
              P.mode = 'foot'; P.pos.set(48.96, 19.807, 222.82); P.vel.set(0,0,0); P.onGround = true;
              const out = {{}};
              P.pos.x -= 0.15;
              out.collides = P.collides(); out.blocked = P.terrainBlocked();
              const k = 0.3*0.85, F = [[0,0],[1,1],[1,-1],[-1,1],[-1,-1]];
              out.probes = F.map(([a,b]) => {{ const x = P.pos.x + a*k, z = P.pos.z + b*k; const r = w.terrainBelow(x, P.pos.y + 1.75, z); return [a, b, r ? [r.y.toFixed(3), r.ceiling] : null, w.groundProbe(x, z, P.pos.y, 0.62, 1.75)]; }});
              const x = P.pos.x - k, z = P.pos.z - k;
              out.col = []; for (let y = 24; y >= 18; y -= 0.25) {{ const r = w.terrainBelow(x, y, z); out.col.push([y, r ? [r.y.toFixed(2), r.ceiling] : null]); }}
              return out; }}''')
            print(r['collides'], r['blocked']); print(r['probes']); 
            for c in r['col']: print('  ', c)
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
