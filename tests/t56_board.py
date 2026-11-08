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
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'high'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            await page.evaluate(f'() => {{ const g = {G}; g.ui.toastsEl.style.display = "none"; g.time = 40; }}')
            # sail the sloop out, spawn a pirate ship alongside
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, s = g.sloop;
              g.boardSloop(0, -1); window.__sim(0.2, () => {{}});
              const sh = g.fleet.spawn('pirate');
              if (!sh) return 'no spawn';
              sh.place(s.pos.x + 14, s.pos.z, s.heading); sh.sailLvl = 0; sh.dest = {{ x: sh.pos.x, z: sh.pos.z - 200 }};
              window.__sim(0.5, () => {{}});
              return {{ crew: sh.crew.map((c) => c.role + '@' + c.L.toArray().map((v) => v.toFixed(1)).join(',')), manned: sh.manned, kids: sh.body.children.length, hostile: g.fleet.hostile(sh) }}; }}''')
            print('spawned', r)
            # look at her from the sloop
            await page.evaluate(f'''() => {{ const g = {G}, P = g.player, sh = g.hollows.find((h) => h.kind === 'pirate'); g.toggleView(); P.yaw = Math.atan2(-(sh.pos.x - P.pos.x), -(sh.pos.z - P.pos.z)); P.pitch = 0.05; window.__sim(0.4, () => {{}}); }}''')
            await page.wait_for_timeout(300); await shot(page, 't56_crew_posts')
            await page.evaluate(f'() => {{ const g = {G}; g.toggleView(); }}')
            # board her from the water
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, sh = g.hollows.find((h) => h.kind === 'pirate');
              P.leaveShip(g.sloop); P.boardCD = 0;
              const c = Math.cos(sh.heading), n = Math.sin(sh.heading);
              P.pos.set(sh.pos.x + (-2.6) * c + (-1.5) * n, sh.pos.y + 0.5, sh.pos.z - (-2.6) * n + (-1.5) * c); P.vel.set(0, 0, 0);
              window.__sim(1.5, () => {{ if (P.mode !== 'foot') {{ g.input.keys.clear(); return false; }} g.input.keys.add('KeyW'); P.yaw = Math.atan2(-(sh.pos.x - P.pos.x), -(sh.pos.z - P.pos.z)); }}); g.input.keys.clear();
              return {{ mode: P.mode, onPirate: P.ship === sh, local: P.local.toArray().map((v) => +v.toFixed(2)) }}; }}''')
            print('boarded', r)
            # the crew comes at you
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, sh = g.hollows.find((h) => h.kind === 'pirate'); const hp0 = P.hp;
              window.__sim(4, () => {{ P.hp = Math.max(P.hp, 40); }});
              return {{ hp0, hp: Math.round(P.hp), states: sh.crew.map((c) => c.state + ':' + c.L.toArray().map((v) => v.toFixed(1)).join(',')), alert: sh.alertT > 0, manned: sh.manned }}; }}''')
            print('fight starts', r)
            await page.evaluate(f'() => {{ const g = {G}; g.toggleView(); window.__sim(0.1, () => {{}}); }}')
            await page.wait_for_timeout(300); await shot(page, 't56_fight3p')
            await page.evaluate(f'() => {{ const g = {G}; g.toggleView(); }}')
            # fight them all with the cutlass
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, sh = g.hollows.find((h) => h.kind === 'pirate'), I = g.input; g.selectSlot(0);
              let hurtTaken = 0, last = P.hp;
              window.__sim(40, () => {{
                if (P.hp < last) hurtTaken += last - P.hp; P.hp = 100; last = P.hp;
                const live = sh.crew.filter((c) => c.state !== 'dead' && c.role !== 'nest');
                if (!live.length) return false;
                let best = null; const w = new (P.pos.constructor)();
                for (const c of live) {{ g.crews.worldPos(c, w); const d = Math.hypot(w.x - P.pos.x, w.z - P.pos.z) + Math.abs(w.y - P.pos.y) * 2; if (!best || d < best.d) best = {{ c, d, x: w.x, y: w.y, z: w.z }}; }}
                window.__aimAt(best.x, best.y + 1.1, best.z);
                const dd = Math.hypot(best.x - P.pos.x, best.z - P.pos.z);
                I.mouseL = dd < 2.4; I.keys.clear(); if (dd > 1.6) I.keys.add('KeyW');
              }});
              I.mouseL = false; I.keys.clear();
              return {{ dead: sh.crew.filter((c) => c.state === 'dead').length, of: sh.crew.length, lookout: sh.crew.find((c) => c.role === 'nest').state, hurtTaken: Math.round(hurtTaken), taken: sh.taken, manned: sh.manned, local: P.local.toArray().map((v) => +v.toFixed(1)) }}; }}''')
            print('after fight', r)
            # the lookout: climb up and deal with him too
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, sh = g.hollows.find((h) => h.kind === 'pirate');
              const nest = sh.crew.find((c) => c.role === 'nest'); g.crews.kill(nest); window.__sim(0.5, () => {{}});
              return {{ taken: sh.taken, manned: sh.manned, box: sh.boxGold }}; }}''')
            print('lookout down', r)
            # walk to the hold and open the strongbox
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, sh = g.hollows.find((h) => h.kind === 'pirate');
              const walkTo = (x, z, secs) => {{ window.__sim(secs, () => {{ const L = P.local; const dx = x - L.x, dz = z - L.z; if (Math.hypot(dx, dz) < 0.15) {{ g.input.keys.clear(); return; }}
                const c = Math.cos(sh.heading), sn = Math.sin(sh.heading); const wx = dx * c + dz * sn, wz = -dx * sn + dz * c; P.yaw = Math.atan2(-wx, -wz); g.input.keys.add('KeyW'); }}); g.input.keys.clear(); return P.local.toArray().map((v) => +v.toFixed(2)); }};
              const path = [walkTo(0, 0.15, 4), walkTo(0, 2.4, 3), walkTo(0.95, 2.4, 1.5), walkTo(0.95, -1.6, 3), walkTo(0.2, -1.75, 1.5)];
              const it = g.computeInteraction(); const gold0 = g.gold;
              if (it && it.id === 'strongbox') g.doInteraction(it);
              const it2 = g.computeInteraction();
              return {{ path, it: it && it.id, label: it && it.label, gold: g.gold - gold0, after: it2 && it2.label }}; }}''')
            print('strongbox', r)
            # drifting: no one at her wheel
            r = await page.evaluate(f'''() => {{ const g = {G}, sh = g.hollows.find((h) => h.kind === 'pirate'); window.__sim(3, () => {{}}); return {{ sail: +sh.sailLvl.toFixed(2), speed: +sh.speed.toFixed(2) }}; }}''')
            print('drift', r)
            print('errors', [l for l in logs if 'error' in l.lower()][:6])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
