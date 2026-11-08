import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from crewlib import *
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    relay = Relay()
    try:
        async with async_playwright() as p:
            b, (A,), (la,) = await crew_pages(p, relay, n=1, w=1280, h=720, quality='medium')
            await A.goto('http://127.0.0.1:8765/brinebound.html')
            await A.wait_for_function('window.__brinebound && window.__brinebound.state === "title"', timeout=90000)
            await A.wait_for_timeout(2500)
            await shot(A, 'title_03')
            print(errors(la))
            await b.close()
    finally:
        relay.stop(); srv.terminate()
asyncio.run(main())
