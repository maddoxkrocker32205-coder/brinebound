import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
G = 'window.__brinebound'
async def title_reload(page):
    await page.reload()
    await page.wait_for_function('window.__brinebound && window.__brinebound.state === "title"', timeout=60000)
    await page.wait_for_function("!document.getElementById('bContinue').classList.contains('hidden')", timeout=20000)
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=960, h=540)
            await page.add_init_script("if (!sessionStorage.getItem('seeded')) { localStorage.clear(); sessionStorage.setItem('seeded', '1'); } localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'low'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(1500)
            # some building so the save has compressed edits
            await page.evaluate(f'async () => {{ const g = {G}, P = g.player, w = g.world; for (let k = 0; k < 40; k++) w.set(Math.floor(P.pos.x) + (k % 8), Math.floor(P.pos.y) + 4 + Math.floor(k / 8), Math.floor(P.pos.z) + 3, 9, true); g.gold = 42; await g.autosave("test", true); }}')
            await page.evaluate(f'async () => {{ const g = {G}; g.gold = 77; await g.saveSlot ? 0 : 0; const doc = await g.buildDoc(); doc.meta.savedAt = Date.now() - 60000; g.saves.writeLocal("s1", doc); }}')
            await title_reload(page)
            print('1 status:', await page.evaluate("document.getElementById('titleStatus').textContent"))
            # 1) a normal continue, without the browser's decompressor
            await page.evaluate("() => { window.DecompressionStream = undefined; }")
            await page.click('#bContinue')
            await page.wait_for_function(f'{G}.state === "play"', timeout=30000)
            print('1 continue (JS inflate):', await page.evaluate(f'() => ({{ state: {G}.state, gold: {G}.gold, edits: {G}.world.edits.size }})'))
            # 2) the newest save is damaged: the older one opens instead
            await page.evaluate(f'() => {{ const d = JSON.parse(localStorage.getItem("brinebound-v2-auto")); delete d.data.editsRaw; d.data.edits = {{ z: "deflate-raw", n: 3, b: "AAAAAAAA" }}; d.meta.savedAt = Date.now(); localStorage.setItem("brinebound-v2-auto", JSON.stringify(d)); }}')
            await title_reload(page)
            await page.click('#bContinue')
            await page.wait_for_function(f'{G}.state === "play"', timeout=30000)
            print('2 fallback:', await page.evaluate(f'() => ({{ state: {G}.state, gold: {G}.gold }})'))
            # 3) every save damaged: the title says so (damaged from the title screen, so nothing re-saves on reload)
            await title_reload(page)
            await page.evaluate(f'() => {{ for (const s of ["auto", "s1"]) {{ const d = JSON.parse(localStorage.getItem("brinebound-v2-" + s)); d.data.v = 99; localStorage.setItem("brinebound-v2-" + s, JSON.stringify(d)); }} }}')
            await title_reload(page)
            await page.click('#bContinue')
            await page.wait_for_timeout(2500)
            print('3 all bad:', await page.evaluate(f'() => ({{ state: {G}.state, note: document.getElementById("titleStatus").textContent, btn: document.getElementById("bContinue").textContent }})'))
            await shot(page, 't61_bad')
            print('errors', [l for l in logs if 'pageerror' in l][:5])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
