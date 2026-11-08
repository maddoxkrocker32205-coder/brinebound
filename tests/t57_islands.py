import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM
G = 'window.__brinebound'
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=960, h=540)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'high'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            await page.evaluate(f'() => {{ const g = {G}; g.ui.toastsEl.style.display = "none"; g.time = 40; }}')
            names = await page.evaluate(f'() => {G}.world.islands.slice(-6).map((o) => [o.name, o.type, Math.round(o.x), Math.round(o.z), +o.r.toFixed(1)])')
            print('new islands', names)
            for name, typ, x, z, r in names:
                # hover the camera above and beside each island and look at it
                await page.evaluate(f'''() => {{ const g = {G}, P = g.player, o = g.world.islands.find((q) => q.name === "{name}");
                  const a = 0.6, d = o.r * 1.9; P.pos.set(o.x + Math.cos(a) * d, 30, o.z + Math.sin(a) * d); P.vel.set(0, 0, 0);
                  P.yaw = Math.atan2(-(o.x - P.pos.x), -(o.z - P.pos.z)); P.pitch = -0.45; g.camMode = 'first';
                  g.world.buildNear(o.x, o.z, o.r * 2.2 + 16);
                  window.__sim(0.05, () => {{ P.pos.y = 30; P.vel.set(0, 0, 0); }}); }}''')
                await page.wait_for_timeout(500)
                await shot(page, f't57_{typ}')
            # the fort's garrison wakes when you come ashore
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, f = g.world.sites.fort, camp = g.quests.camps.fort;
              P.pos.set(f.x + 8, f.y + 1, f.z + 8); P.vel.set(0, 0, 0); window.__sim(1.5, () => {{ P.hp = 100; }});
              return {{ camp: camp && {{ active: camp.active, spawned: camp.spawned, total: camp.total }}, guards: g.enemies.list.filter((s) => s.campId === 'fort').length }}; }}''')
            print('fort camp', r)
            print('errors', [l for l in logs if 'error' in l.lower()][:6])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
