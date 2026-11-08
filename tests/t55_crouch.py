import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM
G = 'window.__brinebound'
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=900, h=520)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'high'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            await page.evaluate(f'() => {{ const g = {G}; g.ui.toastsEl.style.display = "none"; g.time = 40; }}')
            # build a plank platform 3 high on flat ground and walk off it crouched / standing
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, B = 9;
              const x0 = Math.floor(P.pos.x) + 6, z0 = Math.floor(P.pos.z) + 6, y0 = Math.max(14, w.topSolid(x0, z0));
              const spot = {{ x: x0, z: z0, y: y0 }};
              for (let a = -4; a <= 7; a++) for (let c = -4; c <= 4; c++) {{ for (let k = y0 - 3; k <= y0; k++) w.set(x0 + a, k, z0 + c, 3, true); for (let k = y0 + 1; k <= y0 + 7; k++) w.set(x0 + a, k, z0 + c, 0, true); }}
              window.__sim(0.1, () => {{}});
              if (!spot) return null;
              for (let a = -2; a <= 1; a++) for (let c = -2; c <= 2; c++) w.set(spot.x + a, spot.y + 3, spot.z + c, 9, true);
              const run = (crouch) => {{ P.pos.set(spot.x + 0.5, spot.y + 4, spot.z + 0.5); P.vel.set(0, 0, 0); P.yaw = -Math.PI / 2; P.pitch = 0; P.crouch = false; window.__sim(0.5, () => {{}});
                if (crouch) {{ g.input.press('crouch'); window.__sim(0.1, () => {{}}); }}
                const c0 = P.crouch;
                window.__sim(2.5, () => {{ g.input.keys.add('KeyW'); }}); g.input.keys.clear();
                return {{ crouched: c0, x: +(P.pos.x - spot.x).toFixed(2), y: +(P.pos.y - spot.y).toFixed(2), eye: +P.eyeH.toFixed(2), anim: P.animState }}; }};
              return {{ spot, standing: run(false), crouching: run(true) }}; }}''')
            print('edge', r)
            spot = r['spot']
            # crouch under a low roof: can't stand up
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, s = {spot};
              for (let a = 3; a <= 5; a++) for (let c = -1; c <= 1; c++) w.set(s.x + a, s.y + 2, s.z + c, 9, true);
              P.pos.set(s.x + 1.5, s.y + 1, s.z + 0.5); P.vel.set(0,0,0); P.crouch = false; P.yaw = -Math.PI / 2; window.__sim(0.4, () => {{}});
              const walkStand = (() => {{ window.__sim(1.2, () => {{ g.input.keys.add('KeyW'); }}); g.input.keys.clear(); return +(P.pos.x - s.x).toFixed(2); }})();
              P.pos.set(s.x + 1.5, s.y + 1, s.z + 0.5); g.input.press('crouch'); window.__sim(0.1, () => {{}});
              window.__sim(1.6, () => {{ g.input.keys.add('KeyW'); }}); g.input.keys.clear();
              const under = +(P.pos.x - s.x).toFixed(2);
              g.input.press('crouch'); window.__sim(0.2, () => {{}});
              return {{ walkStand, under, stillCrouched: P.crouch, cramped: P.cramped, anim: P.animState, eye: +P.eyeH.toFixed(2) }}; }}''')
            print('low roof', r)
            # emote wheel: open with G, pick with a number, camera goes third person
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, s = {spot};
              P.pos.set(s.x + 0.5, s.y + 1, s.z - 2.5); P.crouch = false; P.vel.set(0,0,0); window.__sim(0.4, () => {{}});
              g.input.press('emote'); window.__sim(0.05, () => {{}});
              const open = !!g.wheel && !document.getElementById('emotes').classList.contains('hidden');
              g.input.press('slot3'); window.__sim(0.05, () => {{}});
              return {{ open, closed: !g.wheel, emote: P.emote && P.emote.id, anim: P.animState, arm: g.showViewArm() }}; }}''')
            print('wheel', r)
            await page.evaluate('() => window.__sim(1.2, () => {})')
            await page.wait_for_timeout(300); await shot(page, 't55_dance')
            for em in ['wave', 'cheer', 'sit', 'salute']:
                await page.evaluate(f'() => {{ const g = {G}; g.player.emote = null; g.playEmote("{em}"); window.__sim(0.9, () => {{}}); }}')
                await page.wait_for_timeout(250); await shot(page, f't55_{em}')
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player; window.__sim(0.3, () => {{ g.input.keys.add('KeyW'); }}); g.input.keys.clear(); return {{ emote: P.emote, arm: g.showViewArm() }}; }}''')
            print('move cancels', r)
            # crouched view with the avatar
            await page.evaluate(f'() => {{ const g = {G}; g.toggleView(); g.input.press("crouch"); window.__sim(0.6, () => {{}}); }}')
            await page.wait_for_timeout(250); await shot(page, 't55_crouch3p')
            # wheel UI shot
            await page.evaluate(f'() => {{ const g = {G}; g.toggleView(); g.openWheel(); g.wheel.x = 60; g.wheel.y = -40; g.updateWheel(); }}')
            await page.wait_for_timeout(200); await shot(page, 't55_wheel')
            print('errors', [l for l in logs if 'error' in l.lower()][:5])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
