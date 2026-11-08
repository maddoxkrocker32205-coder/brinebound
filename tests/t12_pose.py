import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p)
            for view in ['side', 'front']:
                await page.goto(f'http://127.0.0.1:8765/posetest.html?view={view}')
                await page.wait_for_function('window.__done', timeout=30000)
                await page.wait_for_timeout(300)
                await shot(page, f'pose_{view}')
            print('\n'.join(logs[-10:]))
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
