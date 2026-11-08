import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM
G = 'window.__brinebound'
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=960, h=540)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'low'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            await page.evaluate(f'() => {{ const g = {G}; g.ui.toastsEl.style.display = "none"; }}')
            # loot from a fort chest roll
            r = await page.evaluate(f'''() => {{ const g = {G}; const f = g.world.sites.loot.find((l) => l.kind === 'fort'); const res = g.rollChest(f.x, f.y, f.z);
              g.gold += 100; g.give('ruby', 1); g.give('goblet', 2); g.give('idol', 1);
              return {{ fortRoll: res.items, value: g.lootValue(g.inv) }}; }}''')
            print('loot', r)
            await page.wait_for_timeout(300)
            hud = await page.evaluate("() => ({ shown: !document.getElementById('lootC').classList.contains('hidden'), v: document.getElementById('lootV').textContent })")
            print('hud', hud)
            # stow in the sea chest
            r = await page.evaluate(f'''() => {{ const g = {G}; g.boardSloop(0, -2.5); g.openSheet('chest'); return document.querySelector('#sheet').innerText.slice(0, 400); }}''')
            print('chest sheet:', r.replace('\n', ' | ')[:400])
            await page.wait_for_timeout(200); await shot(page, 't59_chest')
            await page.click('#sheet button:has-text("Stow all")')
            await page.wait_for_timeout(100)
            rows = await page.evaluate("() => [...document.querySelectorAll('#sheet .chestRow')].map((r) => r.innerText.replace(/\\n/g, ' ')).slice(0, 8)")
            print('rows', rows)
            # stow the ruby
            await page.evaluate("() => { const rows = [...document.querySelectorAll('#sheet .chestRow')]; const r = rows.find((x) => x.innerText.includes('Ruby')); r.querySelector('button').click(); }")
            r = await page.evaluate(f'() => {{ const g = {G}; return {{ gold: g.gold, chestGold: g.chestGold, ruby: g.inv.ruby, chestRuby: g.chest.ruby, carried: g.lootValue(g.inv), stowed: g.lootValue(g.chest) }}; }}')
            print('after stow', r)
            await page.evaluate(f'() => {G}.closeSheet()')
            # die: carried loot is lost, stowed is kept
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player; P.hurt(500, null); window.__sim(3.5, () => {{}}); return {{ alive: P.alive, carried: g.lootValue(g.inv), stowed: g.lootValue(g.chest), chestGold: g.chestGold }}; }}''')
            print('after death', r)
            # sell at Mags
            r = await page.evaluate(f'''() => {{ const g = {G}; g.give('pearls', 1); g.gold = 20; const b0 = g.banked; g.bank(); return {{ banked: g.banked - b0, pearls: g.inv.pearls, gold: g.gold }}; }}''')
            print('bank+sell', r)
            # save and load keeps the chest gold
            r = await page.evaluate(f'''async () => {{ const g = {G}; const doc = await g.buildDoc(); return {{ chestGold: doc.data.chestGold, chest: doc.data.chest }}; }}''')
            print('saved', r)
            print('errors', [l for l in logs if 'error' in l.lower()][:6])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
