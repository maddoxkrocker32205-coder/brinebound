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
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, o = w.islands.find(o => o.type === 'rock');
              const x = o.x + o.r * 0.85, z = o.z; P.mode = 'foot'; P.pos.set(x, w.groundUnder(x, 40, z), z); P.vel.set(0,0,0);
              P.yaw = Math.atan2(-(o.x - x), -(o.z - z)); P.pitch = 0;
              const log = []; let last = P.pos.clone();
              g.input.keys.add('KeyW');
              window.__sim(5, (g, t) => {{ const d = P.pos.distanceTo(last); last.copy(P.pos); log.push([t.toFixed(2), P.pos.x.toFixed(2), P.pos.y.toFixed(2), P.pos.z.toFixed(2), d.toFixed(3), P.onGround, P.terrainBlocked()]); }});
              g.input.keys.clear();
              // profile ahead of the stop point
              const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), prof = [];
              for (let s = -0.5; s <= 3; s += 0.25) {{ const px = P.pos.x + fx * s, pz = P.pos.z + fz * s; prof.push([s.toFixed(2), w.groundUnder(px, P.pos.y + 6, pz).toFixed(2), w.groundProbe(px, pz, P.pos.y, 0.62, 1.75)]); }}
              const blocks = []; for (let dy = -1; dy <= 3; dy++) {{ const row = []; for (let s = 0; s <= 2; s++) row.push(w.get(Math.floor(P.pos.x + fx * s), Math.floor(P.pos.y) + dy, Math.floor(P.pos.z + fz * s))); blocks.push(row); }}
              return {{ o: [o.x, o.z, o.r], log: log.filter((_, i) => i % 6 === 0), prof, blocks, yaw: P.yaw }}; }}''')
            print('island', r['o'], 'yaw', r['yaw'])
            for l in r['log']: print('  ', l)
            print('profile (s, ground, probe)')
            for l in r['prof']: print('  ', l)
            print('blocks ahead dy=-1..3', r['blocks'])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
