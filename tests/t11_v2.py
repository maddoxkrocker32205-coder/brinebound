import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *

QUALITY = sys.argv[1] if len(sys.argv) > 1 else 'high'

async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p)
            await page.add_init_script(f"localStorage.setItem('brinebound-settings', JSON.stringify({{quality: '{QUALITY}'}}))")
            t0 = time.time()
            await load(page)
            print('boot', round(time.time() - t0, 1), 's')
            await page.wait_for_timeout(1200)
            await shot(page, 'v2_title')
            await page.click('#bStart')
            await page.wait_for_timeout(5000)
            await shot(page, 'v2_creator')
            await page.click("#sheet .tabs button:has-text(\"Ship\")")
            await page.wait_for_timeout(5000)
            await shot(page, 'v2_creator_ship')
            await page.click("#sheet .tabs button:has-text(\"Captain\")")
            await page.wait_for_timeout(300)
            await page.click("#sheet button:has-text(\"Set sail\")")
            await page.wait_for_timeout(1500)
            await shot(page, 'v2_play_first')
            st = await page.evaluate('() => { const g = window.__brinebound; return { state: g.state, mode: g.player.mode, pos: g.player.pos.toArray().map(v => +v.toFixed(2)), fallback: g.input.fallback, locked: g.input.locked, q: g.qualityName(), chapter: g.quests.chapter, tracked: g.quests.tracked_() }; }')
            print(json.dumps(st))
            await page.evaluate('() => window.__brinebound.toggleView()')
            await page.wait_for_timeout(900)
            await shot(page, 'v2_play_third')
            await page.keyboard.press('KeyM')
            await page.wait_for_timeout(800)
            await shot(page, 'v2_map')
            await page.keyboard.press('KeyM')
            await page.wait_for_timeout(300)
            await page.keyboard.press('KeyI')
            await page.wait_for_timeout(500)
            await shot(page, 'v2_bag')
            await page.keyboard.press('Escape')
            await page.wait_for_timeout(300)
            st = await page.evaluate('() => ({ state: window.__brinebound.state, sheet: window.__brinebound.sheets.name })')
            print(st)
            errs = [l for l in logs if 'error' in l.lower() or 'warn' in l.lower()]
            print('\n'.join(errs[-30:]) or 'no errors')
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
