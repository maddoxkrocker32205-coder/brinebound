import asyncio
import os
from pathlib import Path
from playwright.async_api import async_playwright


async def main():
    html = Path(os.environ['BRINEBOUND_TEST_HTML']).resolve().as_uri()
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/chromium'), args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
        ])
        page = await browser.new_page(viewport={'width': 393, 'height': 660}, has_touch=True, is_mobile=True)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await page.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, body=''))
        await page.route('https://fonts.gstatic.com/**', lambda r: r.abort())
        await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality:'low'}));")
        await page.goto(html)
        await page.wait_for_function('window.__brinebound?.state === "title"', timeout=120000)
        await page.tap('#bStart')
        await page.get_by_role('button', name='Set sail').tap()
        await page.wait_for_function('__brinebound.state === "play"', timeout=30000)
        await page.evaluate('__brinebound.saveLocalNow()')
        await page.evaluate('__brinebound.quitToTitle()')
        await page.wait_for_function('__brinebound.state === "title"')
        original = await page.evaluate("localStorage.getItem('brinebound-v2-auto')")
        assert original
        await page.tap('#bStart')
        await page.get_by_role('button', name='Solo battle royale').tap()
        assert await page.get_by_text('Solo survival, not multiplayer', exact=False).count()
        await page.evaluate('__brinebound.wantCrew = true')
        await page.get_by_role('button', name='Set sail').tap()
        await page.wait_for_function('__brinebound.state === "play" && __brinebound.battleRoyale?.drops.length > 0')
        assert await page.evaluate('!__brinebound.wantCrew')
        await page.evaluate('__brinebound.saveLocalNow()')
        assert await page.evaluate("localStorage.getItem('brinebound-v2-auto')") == original
        saved = await page.evaluate("JSON.parse(localStorage.getItem('brinebound-v2-royale')).data.battleRoyale")
        assert saved['drops'] and saved['result'] is None
        assert await page.locator('#royaleStatus').is_visible()
        for width, height in [(393, 660), (852, 340), (667, 300)]:
            await page.set_viewport_size({'width': width, 'height': height})
            overlaps = await page.evaluate("""() => {
              const a = document.getElementById('royaleStatus').getBoundingClientRect();
              return ['gold', 'goal', 'shipPanel', 'compass', 'bMap', 'bQuests', 'bBag', 'bMenu', 'tUse', 'tHit']
                .filter(id => {
                  const el = document.getElementById(id), b = el.getBoundingClientRect();
                  return getComputedStyle(el).display !== 'none' && b.width && b.height &&
                    a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
                });
            }""")
            assert not overlaps, (width, height, overlaps)
        await page.evaluate("""() => {
          window.royaleMapMarks = 0;
          const fill = CanvasRenderingContext2D.prototype.fillRect;
          CanvasRenderingContext2D.prototype.fillRect = function(x, y, w, h) {
            if (w === 10 && h === 10) window.royaleMapMarks++;
            return fill.call(this, x, y, w, h);
          };
          __brinebound.openSheet('map');
        }""")
        assert await page.evaluate('window.royaleMapMarks') > 0
        t = await page.evaluate('__brinebound.battleRoyale.elapsed')
        await page.wait_for_timeout(500)
        assert await page.evaluate('__brinebound.battleRoyale.elapsed') == t
        await page.evaluate('__brinebound.closeSheet()')
        await page.evaluate("""() => {
          const q = __brinebound.quests, original = q.onPlayerDeath.bind(q);
          q.onPlayerDeath = () => { window.questDeaths = (window.questDeaths || 0) + 1; original(); };
          __brinebound.hotSnapshot();
        }""")
        await page.wait_for_function('!__brinebound.saving')
        await page.evaluate("""() => {
          const g = __brinebound, write = g.saves.write.bind(g.saves);
          g.saves.write = async (slot, doc, ...rest) => {
            if (slot === 'royale' && !doc.data.battleRoyale.result && !window.blockedWrite) {
              window.blockedWrite = true;
              await new Promise(resolve => { window.releaseWrite = resolve; });
            }
            return write(slot, doc, ...rest);
          };
          g.autosave('race-test', true);
        }""")
        await page.wait_for_function('window.blockedWrite')
        await page.evaluate('__brinebound.player.hurt(10000, null)')
        assert await page.evaluate("JSON.parse(localStorage.getItem('brinebound-v2-royale')).data.battleRoyale.result") == 'lost'
        assert await page.evaluate("window.questDeaths === 1 && __brinebound.hotSnapshot().doc.data.battleRoyale.result === 'lost'")
        await page.evaluate('window.releaseWrite()')
        await page.wait_for_function("""!__brinebound.saving && !__brinebound.pendingRoyaleLoss &&
          JSON.parse(localStorage.getItem('brinebound-v2-royale')).data.battleRoyale.result === 'lost'""", timeout=30000)
        await page.evaluate('__brinebound.updateTimers(3)')
        await page.wait_for_function('__brinebound.player.alive && __brinebound.sheets.name === "royaleResult"', timeout=30000)
        await page.evaluate('__brinebound.quitToTitle()')
        await page.wait_for_function('__brinebound.state === "title"')
        await page.tap('#bStart')
        await page.get_by_role('button', name='Solo battle royale').tap()
        await page.get_by_role('button', name='Resume solo challenge').tap()
        await page.wait_for_function('__brinebound.state === "play" && __brinebound.battleRoyale?.result === "lost"', timeout=30000)
        assert await page.evaluate('__brinebound.player.alive && !__brinebound.battleRoyale.active')
        assert not errors, errors
        await browser.close()
    print('Solo challenge UI, map, save isolation, elimination and resume: passed; no browser console errors.')


asyncio.run(main())
