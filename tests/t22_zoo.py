import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM

VIEW = '''([kind, dist, h]) => { const g = window.__brinebound;
  const a = g.fauna.list.find(a => a.kind === kind && !a.dead); if (!a) return 'none';
  g.state = 'loading';
  const p = a.group.position; const yaw = Math.random() * 6.28;
  g.camera.position.set(p.x + Math.cos(yaw) * dist, Math.max(p.y + h, 12.4), p.z + Math.sin(yaw) * dist); g.camera.lookAt(p.x, p.y + 0.3, p.z);
  return [p.x, p.y, p.z]; }'''

async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'medium'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            await page.evaluate('() => { const g = window.__brinebound; g.ui.toastsEl.style.display = "none"; document.getElementById("hud").style.display = "none"; }')
            for kind, dist, h in [('boar', 3.2, 1.2), ('parrot', 1.6, 0.4), ('goat', 3, 1.2), ('crab', 1.8, 0.8)]:
                r = await page.evaluate('''(k) => { const g = window.__brinebound, a = g.fauna.list.find(a => a.kind === k); if (a) { g.world.buildNear(a.pos.x, a.pos.z, 40); } return !!a; }''', kind)
                r = await page.evaluate(VIEW, [kind, dist, h])
                await page.wait_for_timeout(700)
                await shot(page, f'z_{kind}')
                await page.evaluate('() => { window.__brinebound.state = "play"; }')
            # sea animals: spawn them in open water next to a stationary camera
            await page.evaluate('''() => { const g = window.__brinebound, s = g.sloop, w = g.world;
              let spot = null; for (let k = 0; k < 400 && !spot; k++) { const x = 30 + Math.random() * 320, z = 30 + Math.random() * 320; let ok = true; for (let dx = -40; dx <= 40 && ok; dx += 8) for (let dz = -40; dz <= 40 && ok; dz += 8) if (w.depthAt(Math.floor(x + dx), Math.floor(z + dz)) < 0.95) ok = false; if (ok) spot = { x, z }; }
              s.place(spot.x, spot.z, 0); g.boardSloop(0, 3.75); g.input.pressed.add('use'); window.__sim(0.05);
              s.sailLvl = 1; s.speed = 8; g.fauna.dolT = 0; window.__sim(3.2, (g) => { s.sailLvl = 1; }); }''')
            r = await page.evaluate('''() => { const g = window.__brinebound, s = g.sloop; const d = g.fauna.list.filter(a => a.kind === 'dolphin');
              let best = d[0]; for (const a of d) if (a.pos.y > best.pos.y) best = a;
              g.state = 'loading'; const p = best.group.position; g.camera.position.set(p.x + 4, 14.5, p.z + 6); g.camera.lookAt(p.x, p.y, p.z); return d.length; }''')
            await page.wait_for_timeout(700)
            await shot(page, 'z_dolphin')
            await page.evaluate('() => { window.__brinebound.state = "play"; }')
            await page.evaluate('''() => { const g = window.__brinebound, s = g.sloop; g.fauna.whaleT = 0; window.__sim(5.5, (g) => { s.sailLvl = 0; s.speed = 0; }); }''')
            r = await page.evaluate('''() => { const g = window.__brinebound; const a = g.fauna.list.find(a => a.kind === 'whale'); if (!a) return 'no whale';
              g.state = 'loading'; const p = a.group.position; const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
              g.camera.position.set(p.x + Math.cos(a.yaw) * 22 + fx * 6, 17, p.z - Math.sin(a.yaw) * 22 + fz * 6); g.camera.lookAt(p.x, p.y + 1, p.z); return [p.x, p.y, p.z]; }''')
            print('whale', r)
            await page.wait_for_timeout(700)
            await shot(page, 'z_whale')
            await page.evaluate('() => { window.__brinebound.state = "play"; }')
            await page.evaluate('''() => { const g = window.__brinebound, P = g.player, s = g.sloop;
              g.input.pressed.add('use'); window.__sim(0.05); P.leaveShip(s); P.mode = 'foot'; P.pos.set(s.pos.x + 22, 10.5, s.pos.z + 3); P.vel.set(0,0,0);
              window.__sim(12, (g) => { g.player.hp = 100; }); }''')
            r = await page.evaluate('''() => { const g = window.__brinebound, P = g.player; const a = g.fauna.list.find(a => a.kind === 'shark'); if (!a) return 'no shark';
              g.state = 'loading'; const p = a.group.position; g.camera.position.set(p.x + 4, 13.6, p.z + 4); g.camera.lookAt(p.x, p.y + 0.4, p.z); return [p.x, p.y, p.z]; }''')
            print('shark', r)
            await page.wait_for_timeout(700)
            await shot(page, 'z_shark')
            print([l for l in logs if 'error' in l.lower()][-5:] or 'no errors')
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
