import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p)
            await load(page)
            await page.evaluate('''() => { const P = window.__brinebound.player; let y = P.yaw; window.__trap = [];
              Object.defineProperty(P, 'yaw', { get() { return y; }, set(v) { if (Number.isNaN(v) && window.__trap.length < 3) window.__trap.push(new Error('yaw NaN').stack); y = v; } });
              let vx = P.vel; }''')
            await page.click('#bStart')
            await page.wait_for_timeout(1500)
            print(await page.evaluate('() => window.__trap'))
            print(await page.evaluate('() => { const g = window.__brinebound; return { dx: g.input.lookDX, dy: g.input.lookDY, sens: g.sens, yaw: g.player.yaw } }'))
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
