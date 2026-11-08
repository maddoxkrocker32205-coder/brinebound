import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, mobile=True, w=844, h=390)
            await load(page)
            await page.tap('#bStart')
            await page.wait_for_timeout(1500)
            for i in range(3):
                print(await page.evaluate('() => { const g = window.__brinebound, P = g.player; return { pos: P.pos.toArray(), mode: P.mode, inter: g.interaction, t: g.time, last: g.last, state: g.state } }'))
                await page.wait_for_timeout(700)
            await page.evaluate('''() => { const g = window.__brinebound, P = g.player, s = g.sloop; P.mode = 'deck'; P.local.set(0, 1.1, 3.4); P.prevShipHeading = s.heading; P.syncDeckWorld(s); }''')
            for i in range(3):
                await page.wait_for_timeout(700)
                print(await page.evaluate('() => { const g = window.__brinebound, P = g.player; return { pos: P.pos.toArray(), local: P.local.toArray(), mode: P.mode, inter: g.interaction, tUse: document.getElementById("tUse").className } }'))
            print('\n'.join(logs[-15:]))
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
