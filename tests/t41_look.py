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
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'high'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            await page.evaluate(f'() => {{ const g = {G}; g.ui.toastsEl.style.display = "none"; g.time = 40; document.querySelectorAll(".hud, #hud").forEach(e => e.style.opacity = 0); }}')
            # the sloop, from the beach
            await page.evaluate(f'''() => {{ const g = {G}, P = g.player, s = g.sloop, w = g.world;
              const c = Math.cos(s.heading), n = Math.sin(s.heading); const px = s.pos.x + c * 9 + n * 2, pz = s.pos.z - n * 9 + c * 2;
              P.mode = 'foot'; P.pos.set(px, Math.max(10.6, w.groundUnder(px, 30, pz)), pz); P.vel.set(0,0,0);
              P.yaw = Math.atan2(-(s.pos.x - px), -(s.pos.z - pz)); P.pitch = 0.12; g.camMode = 'first'; window.__sim(0.3); }}''')
            await page.wait_for_timeout(900); await shot(page, 'look_ship')
            # the captain up close
            await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, sp = w.spawn; P.pos.set(sp.x, w.groundUnder(sp.x, 30, sp.z), sp.z); P.yaw = 2.6; P.pitch = -0.1; g.camMode = 'third'; window.__sim(0.5); }}''')
            await page.wait_for_timeout(900); await shot(page, 'look_captain')
            # a skeleton and its bones
            await page.evaluate(f'''() => {{ const g = {G}, P = g.player; g.enemies.spawnNear(P.pos.x, P.pos.z, 1, 3, 4, {{ kind: 'guard' }}); window.__sim(1.5, () => {{ P.hp = 100; }}); }}''')
            await page.wait_for_timeout(600); await shot(page, 'look_skel')
            print([l for l in logs if 'error' in l.lower()][-6:])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
