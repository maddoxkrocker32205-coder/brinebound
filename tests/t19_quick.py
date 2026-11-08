import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, mobile=True, w=844, h=390)
            await page.add_init_script("localStorage.clear()")
            await load(page)
            await page.tap('#bStart')
            await page.wait_for_timeout(2500)
            await shot(page, 'q1_creator_land')
            vis = await page.evaluate('() => { const b = [...document.querySelectorAll("#sheet button")].find(x => x.textContent === "Set sail"); const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight }; }')
            print('set sail button', vis)
            await page.tap('#sheet button:has-text("Set sail")')
            await page.wait_for_timeout(800)
            print('state', await page.evaluate('() => window.__brinebound.state'))
            print([l for l in logs if 'error' in l.lower()][-5:] or 'no errors')
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
