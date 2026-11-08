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
              P.mode = 'foot'; P.pos.set(54.30, 15.114, 222.88); P.vel.set(0,0,0); P.yaw = Math.PI/2; P.onGround = true;
              const out = {{}};
              out.collidesHere = P.collides();
              const ox = P.pos.x; P.pos.x -= 0.15; out.collidesAhead = P.collides(); out.blockedAhead = P.terrainBlocked();
              const k = 0.3*0.85, F = [[0,0],[1,1],[1,-1],[-1,1],[-1,-1]];
              out.probes = F.map(([a,b]) => {{ const x = P.pos.x + a*k, z = P.pos.z + b*k; const r = w.terrainBelow(x, P.pos.y + 1.75, z); return [a, b, r ? [r.y.toFixed(3), r.ceiling] : null, w.groundUnder(x, P.pos.y+5, z).toFixed(3)]; }});
              P.pos.x = ox;
              // hard blocks in the box
              const hb = []; for (let y = 14; y <= 17; y++) for (let z = 222; z <= 223; z++) for (let x = 53; x <= 54; x++) hb.push([x,y,z,w.get(x,y,z)]);
              out.cells = hb;
              return out; }}''')
            print(r)
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
