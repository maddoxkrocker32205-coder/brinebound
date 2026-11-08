import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM
G = 'window.__brinebound'
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=900, h=520)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'low'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            await page.evaluate(f'() => {{ const g = {G}; g.ui.toastsEl.style.display = "none"; }}')
            # bury the player 4 blocks under a hill
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world;
              let best = null; for (let z = 10; z < 370; z += 3) for (let x = 10; x < 370; x += 3) {{ const y = w.topSolid(x, z); if (y > 16 && [1,2,3,4].includes(w.get(x, y, z)) && (!best || y > best.y)) best = {{ x, z, y }}; }}
              w.set(best.x, best.y - 4, best.z, 0, true); w.set(best.x, best.y - 3, best.z, 0, true);
              P.pos.set(best.x + 0.5, best.y - 4, best.z + 0.5); P.vel.set(0, 0, 0);
              window.__sim(1, () => {{}});
              return {{ best, y: +P.pos.y.toFixed(2) }}; }}''')
            print('buried', r)
            # open the menu and press I'm stuck
            await page.evaluate(f'() => {G}.openSheet("menu")')
            await page.wait_for_timeout(200)
            await page.click('#sheet button:has-text("I’m stuck")')
            await page.wait_for_timeout(200)
            r2 = await page.evaluate(f'''() => {{ const g = {G}; window.__sim(3, () => {{}}); return {{ state: g.state, left: g.stuck && +g.stuck.t.toFixed(1), note: document.getElementById('stuckText').textContent, hidden: document.getElementById('stuckNote').classList.contains('hidden') }}; }}''')
            print('after 3s', r2)
            await shot(page, 't53_countdown')
            r3 = await page.evaluate(f'''() => {{ const g = {G}, P = g.player; window.__sim(4.5, () => {{}}); return {{ y: +P.pos.y.toFixed(2), top: g.world.topSolid(Math.floor(P.pos.x), Math.floor(P.pos.z)), stuck: !!g.stuck, hidden: document.getElementById('stuckNote').classList.contains('hidden') }}; }}''')
            print('after 7.5s', r3)
            # moving cancels
            r4 = await page.evaluate(f'''() => {{ const g = {G}, P = g.player; g.startStuck(); window.__sim(1, () => {{ g.input.keys.add('KeyW'); }}); g.input.keys.clear(); return {{ stuck: !!g.stuck }}; }}''')
            print('moving cancels', r4)
            print('errors', [l for l in logs if 'error' in l.lower()][:5])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
