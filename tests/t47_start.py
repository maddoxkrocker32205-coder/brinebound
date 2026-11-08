import asyncio, sys, time
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from crewlib import *
G = 'window.__brinebound'
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    relay = Relay(latency=0.06, drop=0.0)
    try:
        async with async_playwright() as p:
            b, (A, Bp), (la, lb) = await crew_pages(p, relay, w=1100, h=620, quality='medium')
            async def go(page, tag):
                t0 = time.time()
                await page.goto('http://127.0.0.1:8765/brinebound.html')
                await page.wait_for_function('window.__brinebound && window.__brinebound.state === "title"', timeout=120000)
                t1 = time.time()
                await page.click('#bStart')
                await page.wait_for_selector('#sheet button:has-text("Set sail")', timeout=60000)
                t2 = time.time()
                fps0 = await page.evaluate(f'{G}.frameN || 0')
                await asyncio.sleep(3)
                fps = ((await page.evaluate(f'{G}.frameN || 0')) - fps0) / 3
                await page.click('#sheet button:has-text("Set sail")', timeout=120000)
                t3 = time.time()
                print(tag, 'title', round(t1 - t0, 1), 'sheet', round(t2 - t1, 1), 'click sail', round(t3 - t2, 1), 'frames/s on sheet', fps)
            await asyncio.gather(go(A, 'A'), go(Bp, 'B'))
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
