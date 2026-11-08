import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *

async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p)
            await load(page)
            await page.wait_for_timeout(1500)
            await shot(page, 'title')
            fps = await page.evaluate('''() => new Promise(r => { let n = 0; const t0 = performance.now(); function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); } requestAnimationFrame(f); })''')
            print('fps', fps)
            await page.click('#bStart')
            await page.wait_for_timeout(1500)
            await shot(page, 'spawn')
            st = await page.evaluate('() => { const g = window.__brinebound; return { state: g.state, mode: g.player.mode, pos: g.player.pos.toArray(), yaw: g.player.yaw, fallback: g.input.fallback, locked: g.input.locked, ship: g.sloop.pos.toArray() }; }')
            print(st)
            print('\n'.join(logs[-30:]))
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
