import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from t2_play import SIM

async def run(p, w, h, tag):
    b, page, logs = await setup(p, mobile=True, w=w, h=h)
    await load(page)
    await page.wait_for_timeout(1200)
    await shot(page, f'm_{tag}_title')
    await page.tap('#bStart'); await page.wait_for_timeout(400)
    await page.tap('#sheet button:has-text("Set sail")')
    await page.wait_for_function('window.__brinebound.state === "play"', timeout=30000)
    await page.wait_for_timeout(1500)
    await page.evaluate(SIM)
    info = await page.evaluate('() => { const g = window.__brinebound; return { touch: g.isTouch, state: g.state, locked: g.input.locked, hud: !document.getElementById("touch").classList.contains("hidden") } }')
    print(tag, info)
    # simulate a joystick drag on the left and a look drag on the right using CDP touch events
    cdp = await page.context.new_cdp_session(page)
    async def touch(type_, pts):
        await cdp.send('Input.dispatchTouchEvent', {'type': type_, 'touchPoints': pts})
    x0, y0 = w * 0.2, h * 0.7
    await touch('touchStart', [{'x': x0, 'y': y0, 'id': 1}])
    for i in range(1, 6):
        await touch('touchMove', [{'x': x0, 'y': y0 - i * 10, 'id': 1}])
        await page.wait_for_timeout(60)
    await page.wait_for_timeout(1500)
    await shot(page, f'm_{tag}_joy')
    st = await page.evaluate('() => { const g = window.__brinebound; return { joy: [g.input.joy.x, g.input.joy.y], pos: g.player.pos.toArray(), move: [g.input.move.x, g.input.move.y] } }')
    await touch('touchEnd', [])
    print(tag, 'joystick', st)
    # tap Hit button & hotbar
    await page.tap('.slot:nth-child(3)')
    await page.wait_for_timeout(300)
    sel = await page.evaluate('() => window.__brinebound.sel')
    print(tag, 'selected slot', sel)
    # put player at helm to check helm touch layout
    await page.evaluate('''() => { const g = window.__brinebound, P = g.player, s = g.sloop; g.boardSloop(0, 6.6); }''')
    await page.wait_for_timeout(800)
    await shot(page, f'm_{tag}_deck')
    await page.tap('#tUse')
    await page.wait_for_timeout(1200)
    await shot(page, f'm_{tag}_helm')
    mode = await page.evaluate('() => window.__brinebound.player.mode')
    print(tag, 'mode after Use', mode)
    await page.tap('#bMap')
    await page.wait_for_timeout(800)
    await shot(page, f'm_{tag}_map')
    await page.tap('#sheet header button:has-text("Close")')
    errs = [l for l in logs if 'error' in l.lower()]
    print(tag, 'errors', errs[-10:])
    await b.close()

async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            await run(p, 844, 390, 'land')
            await run(p, 390, 844, 'port')
    finally:
        srv.terminate()
asyncio.run(main())
