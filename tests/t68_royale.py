import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, mobile=False, w=1280, h=720)
            await page.add_init_script("localStorage.clear()")
            await load(page)
            await page.click('#bStart')
            await page.wait_for_timeout(2500)
            await page.click('#sheet button:has-text("Set sail")')
            await page.wait_for_timeout(1500)
            r = await page.evaluate('''() => { const G = window.__brinebound; G.royale.setActive(true);
              G.royale.t = 0.1; for (let i = 0; i < 40; i++) G.royale.update(0.1);
              const a = { stage: G.royale.stage, r: G.royale.r, hud: document.getElementById('royale').textContent };
              G.royale.phase = 'shrink'; G.royale.t = 0.05; G.royale.update(0.1);
              return { a, stage: G.royale.stage, r: G.royale.r }; }''')
            print(r)
            await shot(page, 'royale')
            errs = [l for l in logs if 'error' in l.lower()]
            print(errs[-5:] or 'no errors')
            assert r['a']['stage'] == 0 and 'Circle 1' in r['a']['hud']
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
