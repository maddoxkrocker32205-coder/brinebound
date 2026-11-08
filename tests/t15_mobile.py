import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM

async def ev(page, js):
    return await page.evaluate(js)

async def run(p, w, h, tag):
    b, page, logs = await setup(p, mobile=True, w=w, h=h)
    await page.add_init_script("localStorage.clear()")
    await load(page)
    await page.wait_for_timeout(800)
    await shot(page, f'm_{tag}_title')
    await page.tap('#bStart')
    await page.wait_for_timeout(2500)
    await shot(page, f'm_{tag}_creator')
    await page.tap('#sheet button:has-text("Set sail")')
    await page.wait_for_timeout(1500)
    await ev(page, SIM)
    await ev(page, '() => { window.__brinebound.ui.toastsEl.style.display = "none"; }')
    await shot(page, f'm_{tag}_play')
    print(tag, await ev(page, '() => { const g = window.__brinebound; return { touch: g.isTouch, q: g.qualityName(), state: g.state, hud: !document.getElementById("touch").classList.contains("hidden") } }'))
    await page.tap('#tView')
    await page.wait_for_timeout(800)
    await shot(page, f'm_{tag}_third')
    await page.tap('#bBag')
    await page.wait_for_timeout(800)
    await shot(page, f'm_{tag}_bag')
    await page.tap('#sheet header button')
    await page.wait_for_timeout(400)
    await ev(page, '''() => { const g = window.__brinebound; g.boardSloop(0, 3.75); g.input.pressed.add('use'); window.__sim(0.1); }''')
    await page.wait_for_timeout(1000)
    await shot(page, f'm_{tag}_helm')
    await ev(page, '''() => { const g = window.__brinebound, P = g.player, m = g.npcs.get('mags'); g.input.pressed.add('use'); window.__sim(0.05);
      P.mode = 'foot'; P.pos.set(m.site.x + 1.6, m.site.y, m.site.z + 0.2); P.vel.set(0,0,0); window.__aimAt(m.site.x, m.site.y + 1.5, m.site.z); window.__sim(0.2); }''')
    await page.wait_for_timeout(600)
    await shot(page, f'm_{tag}_near_mags')
    await page.tap('#tUse')
    await page.wait_for_timeout(800)
    await shot(page, f'm_{tag}_mags')
    print(tag, 'sheet', await ev(page, '() => window.__brinebound.sheets.name'))
    errs = [l for l in logs if 'error' in l.lower()]
    print('\n'.join(errs[-10:]) or 'no errors')
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
