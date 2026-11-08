import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM
G = 'window.__brinebound'
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=1000, h=560)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'medium'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            await page.evaluate(f'() => {{ const g = {G}; g.ui.toastsEl.style.display = "none"; g.time = 40; }}')
            # the sea fills with ships
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, s = g.sloop;
              g.boardSloop(0, -2); window.__sim(30, (g) => {{ P.hp = 100; }});
              const ships = g.hollows.map(h => ({{ kind: h.kind, name: h.name, d: Math.round(Math.hypot(h.pos.x - s.pos.x, h.pos.z - s.pos.z)), speed: +h.speed.toFixed(1), hp: h.hp }}));
              return {{ ships }}; }}''')
            print('fleet', r)
            # a merchant alongside: fire on it, the navy takes notice, then sink it for its strongbox
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, s = g.sloop;
              const m = g.hollows.find(h => h.kind === 'merchant'); if (!m) return null;
              const c = Math.cos(s.heading), sn = Math.sin(s.heading);
              m.pos.x = s.pos.x + c * 16; m.pos.z = s.pos.z - sn * 16; m.heading = s.heading; m.applyTransform();
              P.mode = 'helm'; P.local.set(0, 2.25, 3.45);
              const hp0 = m.hp, n0 = g.projectiles.list.length; g.inv.ball = 40;
              g.playerFire(1); window.__sim(1.5);
              const hit = hp0 - m.hp;
              const after = {{ hit: +hit.toFixed(1), angry: +(m.angryT || 0).toFixed(0), notoriety: g.fleet.notoriety, navyHostile: g.hollows.filter(h => h.kind === 'navy').map(h => g.fleet.hostile(h)) }};
              const loot0 = g.props.loot.length;
              m.damage(999, g); window.__sim(0.5);
              after.sunk = m.sinking; after.loot = g.props.loot.length - loot0; after.notorietyAfter = g.fleet.notoriety;
              return after; }}''')
            print('merchant', r)
            # a pirate comes for you
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, s = g.sloop;
              const pr = g.hollows.find(h => h.kind === 'pirate') || g.fleet.spawn('pirate'); if (!pr) return null;
              // take the sloop out to open water, the pirate 50 m off
              const w = g.world; let spot = null;
              for (let k = 0; k < 400 && !spot; k++) {{ const a = Math.random() * 6.28, d = 50 + Math.random() * 170, x = s.pos.x + Math.cos(a) * d, z = s.pos.z + Math.sin(a) * d;
                let ok = x > 40 && z > 40 && x < 344 && z < 344; for (let i = -12; i <= 58 && ok; i += 5) for (let j = -12; j <= 22 && ok; j += 5) if (w.surf[Math.floor(x + i) + Math.floor(z + j) * 384] > 10) ok = false;
                if (ok) spot = {{ x, z }}; }}
              if (!spot) return {{ err: 'no open water' }};
              s.place(spot.x, spot.z, 0); P.syncDeckWorld(s);
              pr.pos.x = spot.x + 48; pr.pos.z = spot.z + 8; pr.heading = 1.2; pr.applyTransform(); const hp0 = s.hp; let shots = 0, minD = 1e9;
              const n0 = g.projectiles.list.length;
              window.__sim(25, (g) => {{ P.hp = 100; s.hp = Math.max(s.hp, 60); minD = Math.min(minD, Math.hypot(pr.pos.x - s.pos.x, pr.pos.z - s.pos.z)); for (const b of g.projectiles.list) if (b.owner === pr && !b.counted) {{ b.counted = 1; shots++; }} }});
              return {{ hostile: g.fleet.hostile(pr), closestApproach: Math.round(minD), shotsFired: shots, sloopHit: hp0 > s.hp || shots > 0 }}; }}''')
            print('pirate', r)
            await page.evaluate(f'''() => {{ const g = {G}, P = g.player, s = g.sloop; P.mode = 'deck'; g.boardSloop(0, -3);
              const pr = g.hollows.find(h => h.kind === 'pirate'); const mm = g.hollows.find(h => h.kind === 'navy') || g.hollows.find(h => h.kind === 'merchant' && !h.sinking);
              if (pr) {{ pr.pos.set(s.pos.x + 22, pr.pos.y, s.pos.z - 14); pr.heading = s.heading + 0.6; pr.sailLvl = 1; pr.applyTransform(); }}
              if (mm) {{ mm.pos.set(s.pos.x - 26, mm.pos.y, s.pos.z - 30); mm.heading = s.heading - 0.4; mm.sailLvl = 1; mm.applyTransform(); }}
              P.yaw = Math.atan2(-((pr ? pr.pos.x : s.pos.x + 20) - P.pos.x), -((pr ? pr.pos.z : s.pos.z) - P.pos.z)) + 0.5; P.pitch = 0.02; g.camMode = 'third'; window.__sim(0.1); }}''')
            await page.wait_for_timeout(800); await shot(page, 'fleet_view')
            print([l for l in logs if 'error' in l.lower()][-6:])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
