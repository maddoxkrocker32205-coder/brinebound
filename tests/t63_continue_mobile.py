import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
G = 'window.__brinebound'
# Continue voyage on phones: a tap (not a mouse click) on the button, in portrait and landscape
async def one(p, w, h, label):
    b, page, logs = await setup(p, mobile=True, w=w, h=h)
    await page.add_init_script("if (!sessionStorage.getItem('seeded')) { localStorage.clear(); sessionStorage.setItem('seeded', '1'); } localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'low'}))")
    await load(page)
    await page.tap('#bStart'); await page.wait_for_timeout(400)
    await page.tap('#sheet button:has-text("Set sail")')
    await page.wait_for_function(f'{G}.state === "play"', timeout=30000)
    await page.wait_for_timeout(1500)
    await page.evaluate(f'async () => {{ {G}.gold = 31; await {G}.autosave("test", true); }}')
    await page.reload()
    await page.wait_for_function(f'{G} && {G}.state === "title"', timeout=60000)
    await page.wait_for_function("!document.getElementById('bContinue').classList.contains('hidden')", timeout=20000)
    hit = await page.evaluate("() => { const b = document.getElementById('bContinue').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { box: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)], hit: e && (e.id || e.className || e.tagName), inView: b.bottom <= innerHeight && b.top >= 0 }; }")
    await page.screenshot(path=f'{SHOTS}/t63_{label}_title.png')
    await page.tap('#bContinue')
    t0 = asyncio.get_event_loop().time()
    try:
        await page.wait_for_function(f'{G}.state === "play"', timeout=30000)
        ok = True
    except Exception:
        ok = False
    secs = round(asyncio.get_event_loop().time() - t0, 1)
    st = await page.evaluate(f'() => ({{ state: {G}.state, gold: {G}.gold, note: document.getElementById("titleStatus").textContent }})')
    print(label, hit, 'continued:', ok, f'{secs}s', st, 'errors:', [l for l in logs if 'error' in l.lower()][:4])
    await b.close()
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            await one(p, 390, 844, 'portrait')
            await one(p, 844, 390, 'landscape')
            await one(p, 667, 375, 'small_landscape')
    finally:
        srv.terminate()
asyncio.run(main())
