import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, mobile=True, w=844, h=390)
            await page.add_init_script("localStorage.clear()")
            await load(page)
            await page.wait_for_timeout(800)
            await page.tap('#bStart'); await page.wait_for_timeout(2500)
            await page.tap('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(1500)
            await page.evaluate(SIM)
            await page.evaluate('() => { const g = window.__brinebound; g.ui.toastsEl.style.display = "none"; g.time = 40; }')
            # take the hammer by tapping its slot, then pick the stairs and stone from the strip
            await page.tap('#hotbar .slot >> nth=3'); await page.wait_for_timeout(300)
            await page.evaluate('window.__sim(0.1)')
            vis = await page.evaluate('() => !document.getElementById("pieceStrip").classList.contains("hidden")')
            await page.tap('#pieceStrip .piece >> nth=4'); await page.tap('#pieceStrip .piece.mat')
            st = await page.evaluate('() => { const B = window.__brinebound.builder; return { kind: B.kind, mat: B.mat, cost: document.querySelector("#pieceStrip .pcost").textContent }; }')
            print('strip visible', vis, st)
            await page.tap('#pieceStrip .piece >> nth=0'); await page.tap('#pieceStrip .piece.mat')
            await page.evaluate('''() => { const g = window.__brinebound, P = g.player, w = g.world; const o = w.islands.find(o => o.type === 'forest') || w.islands[1];
              P.mode = 'foot'; P.pos.set(o.x, w.groundUnder(o.x, 39, o.z), o.z); P.pitch = -0.5; window.__sim(0.3); }''')
            await page.wait_for_timeout(600)
            await shot(page, 'mb_hammer')
            # place with the Place button
            n0 = await page.evaluate('window.__brinebound.inv.plank')
            await page.tap('#tPlace'); await page.wait_for_timeout(200)
            await page.evaluate('window.__sim(0.1)')
            print('placed with the button', n0, '->', await page.evaluate('window.__brinebound.inv.plank'), await page.evaluate('window.__brinebound.builder.target && window.__brinebound.builder.target.why'))
            print([l for l in logs if 'error' in l.lower()][-5:])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
