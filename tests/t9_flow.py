import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from t2_play import SIM
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p)
            await load(page)
            await page.click('#bStart')
            await page.wait_for_timeout(1200)
            await page.evaluate(SIM)
            print('locked', await page.evaluate('() => window.__brinebound.input.locked'))
            await page.evaluate('() => document.exitPointerLock()')
            await page.wait_for_timeout(800)
            print('after exit', await page.evaluate('() => ({ state: window.__brinebound.state, pause: !document.getElementById("pauseSheet").classList.contains("hidden") })'))
            await shot(page, 'f1_pause')
            await page.click('#bResume')
            await page.wait_for_timeout(800)
            print('after resume', await page.evaluate('() => ({ state: window.__brinebound.state, locked: window.__brinebound.input.locked })'))
            # make progress, place a block, save
            r = await page.evaluate('''() => { const g = window.__brinebound, P = g.player, w = g.world;
              g.inv.stone = 5; g.selectSlot(3);
              window.__aimAt(P.pos.x + 2, P.pos.y - 0.5, P.pos.z);
              g.input.pressed.add('place'); window.__sim(0.1);
              g.gold = 77; g.writeSave();
              return { stone: g.inv.stone, edits: g.world.edits.size }; }''')
            print('placed', r)
            await page.reload()
            await page.wait_for_function('window.__brinebound && window.__brinebound.state === "title"', timeout=60000)
            await page.wait_for_timeout(500)
            vis = await page.evaluate('() => ({ cont: !document.getElementById("bContinue").classList.contains("hidden"), start: document.getElementById("bStart").textContent, edits: window.__brinebound.world.edits.size })')
            print('after reload', vis)
            await shot(page, 'f2_continue_title')
            await page.click('#bContinue')
            await page.wait_for_timeout(1000)
            print('continued', await page.evaluate('() => { const g = window.__brinebound; return { gold: g.gold, stone: g.inv.stone, state: g.state, pos: g.player.pos.toArray() } }'))
            await page.evaluate('() => window.__brinebound.toggleSheet("map")')
            await page.wait_for_timeout(600)
            await shot(page, 'f3_map')
            print('errors', [l for l in logs if 'error' in l.lower()][-5:])
            await b.close()
            b, page, logs = await setup(p, mobile=True, w=390, h=844)
            await load(page)
            await page.wait_for_timeout(800)
            await shot(page, 'f4_port_title')
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
