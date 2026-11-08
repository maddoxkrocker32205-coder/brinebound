import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM

async def ev(page, js, arg=None):
    return await page.evaluate(js, arg) if arg is not None else await page.evaluate(js)

FIND = '''(kind) => { const g = window.__brinebound, P = g.player; let best = null;
  for (const a of g.fauna.list) if (a.kind === kind && !a.dead) { const d = Math.hypot(a.pos.x - g.world.spawn.x, a.pos.z - g.world.spawn.z); if (!best || d < best.d) best = { a, d }; }
  if (!best) return null; const a = best.a; return { x: a.pos.x, y: a.pos.y, z: a.pos.z, island: g.world.islands[a.island] ? g.world.islands[a.island].name : '' }; }'''

async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'medium'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await ev(page, SIM)
            await ev(page, '() => { const g = window.__brinebound; g.ui.toastsEl.style.display = "none"; }')
            counts = await ev(page, '() => { const c = {}; for (const a of window.__brinebound.fauna.list) c[a.kind] = (c[a.kind] || 0) + 1; return { c, schools: window.__brinebound.fauna.schools.length }; }')
            print('fauna', counts)
            for kind in ['crab', 'boar', 'goat', 'turtle']:
                f = await ev(page, FIND, kind)
                if not f: print('no', kind); continue
                await ev(page, '''(f) => { const g = window.__brinebound, P = g.player; g.camMode = 'third'; P.mode = 'foot';
                  const x = f.x + 3.2, z = f.z + 2.2; P.pos.set(x, g.world.standY(Math.floor(x), Math.floor(z)) + 0.01, z); P.vel.set(0,0,0);
                  g.world.buildNear(x, z, 60); window.__aimAt(f.x, f.y + 0.3, f.z); P.pitch = Math.max(P.pitch, -0.45); window.__sim(0.4); }''', f)
                await page.wait_for_timeout(700)
                await shot(page, f'a_{kind}')
                print(kind, f)
            # fight a boar
            r = await ev(page, '''() => { const g = window.__brinebound, P = g.player; const a = g.fauna.list.find(a => a.kind === 'boar' && !a.dead); if (!a) return 'no boar';
              P.pos.set(a.pos.x + 2, a.pos.y, a.pos.z); P.vel.set(0,0,0); g.camMode = 'first'; g.selectSlot(0);
              const m0 = g.inv.meat || 0; let hurtBy = 0; const hp0 = P.hp;
              window.__sim(12, (g) => { if (a.dead) return false; window.__aimAt(a.pos.x, a.pos.y + 0.6, a.pos.z); g.input.mouseL = Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) < 3; });
              g.input.mouseL = false; window.__sim(1);
              return { dead: a.dead, meat: (g.inv.meat || 0) - m0, hpLost: +(hp0 - P.hp).toFixed(1), angry: a.angry > 0 }; }''')
            print('boar fight', r)
            # tame a parrot
            f = await ev(page, FIND, 'parrot')
            print('parrot', f)
            if f:
                r = await ev(page, '''(f) => { const g = window.__brinebound, P = g.player; const a = g.fauna.list.find(a => a.kind === 'parrot' && Math.abs(a.pos.x - f.x) < 0.01 && Math.abs(a.pos.z - f.z) < 0.01);
                  a.state = 'perch'; a.waitT = 99;
                  P.mode = 'foot'; const x = a.pos.x + 2.5, z = a.pos.z + 1.5; P.pos.set(x, Math.max(g.world.standY(Math.floor(x), Math.floor(z)), a.pos.y - 1.4) + 0.01, z); P.vel.set(0,0,0);
                  g.selectSlot(7); window.__aimAt(a.pos.x, a.pos.y + 0.3, a.pos.z); g.input.pressed.add('place'); window.__sim(0.1);
                  return { pet: g.pet, coconut: g.inv.coconut }; }''', f)
                print('tame', r)
                await ev(page, '() => { const g = window.__brinebound, P = g.player; g.camMode = "third"; P.yaw += 2.6; P.pitch = -0.2; window.__sim(0.5); }')
                await page.wait_for_timeout(600)
                await shot(page, 'a_pet')
            # dolphins beside a sailing sloop
            r = await ev(page, '''() => { const g = window.__brinebound, P = g.player, s = g.sloop, w = g.world;
              let spot = null; for (let k = 0; k < 4000 && !spot; k++) { const x = 30 + Math.random() * 320, z = 30 + Math.random() * 320; let ok = true; for (let dx = -24; dx <= 24 && ok; dx += 6) for (let dz = -24; dz <= 24 && ok; dz += 6) if (w.depthAt(Math.floor(x + dx), Math.floor(z + dz)) < 0.95) ok = false; if (ok) spot = { x, z }; }
              s.place(spot.x, spot.z, 0); g.boardSloop(0, 3.75); g.input.pressed.add('use'); window.__sim(0.05);
              s.sailLvl = 1; s.speed = 8; g.fauna.dolT = 0; g.camMode = 'third';
              window.__sim(4, (g) => { s.sailLvl = 1; });
              return { dolphins: g.fauna.list.filter(a => a.kind === 'dolphin').length, mode: P.mode, spot }; }''')
            print('dolphins', r)
            await page.wait_for_timeout(600)
            await shot(page, 'a_dolphins')
            r = await ev(page, '''() => { const g = window.__brinebound, s = g.sloop; g.fauna.whaleT = 0; window.__sim(6, (g) => { s.sailLvl = 0.3; });
              const wh = g.fauna.list.find(a => a.kind === 'whale'); if (wh) { g.helmYaw = Math.atan2(-(wh.pos.x - s.pos.x), -(wh.pos.z - s.pos.z)) - s.heading + Math.PI; }
              window.__sim(0.3); return { whale: !!wh }; }''')
            print('whale', r)
            await page.wait_for_timeout(600)
            await shot(page, 'a_whale')
            # a shark finds a swimmer
            r = await ev(page, '''() => { const g = window.__brinebound, P = g.player, s = g.sloop;
              g.input.pressed.add('use'); window.__sim(0.05); P.leaveShip(s); P.mode = 'foot'; P.pos.set(s.pos.x + 20, 10.5, s.pos.z + 3); P.vel.set(0,0,0);
              window.__sim(14, (g) => { g.player.hp = 100; });
              const sh = g.fauna.list.find(a => a.kind === 'shark'); if (sh) window.__aimAt(sh.pos.x, sh.pos.y + 0.5, sh.pos.z);
              window.__sim(0.1); return { shark: !!sh, rad: sh && +sh.rad.toFixed(1), inWater: P.inWater }; }''')
            print('shark', r)
            await page.wait_for_timeout(600)
            await shot(page, 'a_shark')
            errs = [l for l in logs if 'error' in l.lower()]
            print('\n'.join(errs[-10:]) or 'no errors')
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
