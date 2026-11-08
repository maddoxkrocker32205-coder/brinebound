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
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, sp = w.spawn;
              const x = Math.floor(sp.x) + 4, z = Math.floor(sp.z) + 4; const gy = w.groundUnder(x + 0.5, 30, z + 2.5);
              P.pos.set(x + 0.5, gy, z + 2.6); P.vel.set(0, 0, 0); P.yaw = 0; P.pitch = 0;
              const by = Math.floor(gy + 0.3); for (let dx = -1; dx <= 1; dx++) {{ w.set(x + dx, by, z, 9); w.set(x + dx, by + 1, z, 9); }}
              w.processDirty(9);
              g.input.keys.add('KeyW'); g.input.keys.add('Space'); const log = [];
              window.__sim(1.6, (g, t) => {{ log.push([t.toFixed(2), P.pos.y.toFixed(2), P.pos.z.toFixed(2), P.vel.y.toFixed(1), !!P.mantle, P.onGround]); }});
              g.input.keys.clear();
              return {{ gy: gy.toFixed(2), by, wall: [x, z], log: log.filter((_, i) => i % 3 === 0) }}; }}''')
            print('mantle', r['gy'], r['by'], r['wall'])
            for l in r['log']: print('  ', l)
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, o = w.islands[1];
              const x = Math.floor(o.x), z = Math.floor(o.z); const gy = w.groundUnder(x + 0.5, 40, z + 0.5);
              P.pos.set(x + 0.5, gy, z + 0.5); P.vel.set(0,0,0); g.selectSlot(1);
              const out = [];
              for (let k = 0; k < 4; k++) {{ g.input.mouseL = true; let got = null; const before = new Map(w.edits);
                window.__sim(4, (g) => {{ P.yaw = 0; P.pitch = -1.5; for (const [i, id] of w.edits) if (!before.has(i)) {{ got = [i % 384, Math.floor(i / (384*384)), Math.floor(i / 384) % 384]; return false; }} }});
                g.input.mouseL = false; window.__sim(0.8); out.push({{ dug: got, feet: P.pos.y.toFixed(2), ground: w.groundUnder(P.pos.x, P.pos.y, P.pos.z).toFixed(2) }}); }}
              return {{ start: [x, gy.toFixed(2), z], out }}; }}''')
            print('dig', r)
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
