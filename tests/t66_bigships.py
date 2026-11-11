import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM
G = 'window.__brinebound'
HELPERS = r'''
window.__bs = (() => {
  const g = window.__brinebound, w = g.world, SEA = 12, Wd = Math.round(Math.sqrt(w.surf.length));
  const open = (R) => { for (let k = 0; k < 20000; k++) { const x = 60 + Math.random() * (Wd - 120), z = 60 + Math.random() * (Wd - 120); let ok = true;
      for (let dx = -R; dx <= R && ok; dx += 4) for (let dz = -R; dz <= R && ok; dz += 4) if (w.surf[Math.floor(x + dx) + Math.floor(z + dz) * Wd] > SEA - 3) ok = false; if (ok) return { x, z }; } return null; };
  const Ship = g.sloop.constructor;
  const spawn = (kind, x, z, h) => { const s = new Ship(g.scene, kind, {}); s.place(x, z, h); s.sailLvl = 0; g.hollows.push(s); g.crews.man(s); return s; };
  const pen = (a, b) => a.hullContact(b)?.depth || 0;
  const clearAll = () => { for (const s of g.hollows.slice()) { g.crews.list = g.crews.list.filter((c) => c.ship !== s); s.dispose(); } g.hollows.length = 0; };
  return { open, spawn, pen, clearAll, Wd };
})();'''
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=960, h=540)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'low'}))")
            await load(page)
            await page.evaluate(SIM)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")')
            await page.wait_for_function(f'{G}.state === "play"', timeout=30000)
            await page.evaluate(f'() => {{ {G}.ui.toastsEl.style.display = "none"; {G}.time = 40; {G}.fleet.update = () => {{}}; }}')
            await page.evaluate(HELPERS)
            # A) sizes
            r = await page.evaluate('''() => { const g = window.__brinebound, B = window.__bs, s = g.sloop, o = B.open(44); B.clearAll(); s.place(o.x, o.z, 0); s.speed = 0; s.sailLvl = 0;
              const p = B.spawn('pirate', o.x + 40, o.z, 0); g.sloop.group.updateMatrixWorld(true); p.group.updateMatrixWorld(true);
              s.hull.geometry.computeBoundingBox(); const Box3 = s.hull.geometry.boundingBox.constructor, V3 = s.pos.constructor;
              const box = (x) => { const b = new Box3().setFromObject(x.body); const v = new V3(); b.getSize(v); return v.toArray().map((n) => +n.toFixed(1)); };
              const sailor = g.crews.list.find((c) => c.ship === p), ws = new V3(); if (sailor) sailor.av.root.getWorldScale(ws);
              return { sloop: box(s), pirate: box(p), size: [s.size, p.size], sailors: g.crews.list.filter((c) => c.ship === p).length, sailorScale: +ws.x.toFixed(2) }; }''')
            print('A sizes (x, y, z metres):', r)
            # B) walking the 2x decks
            r = await page.evaluate('''() => { const g = window.__brinebound, P = g.player, s = g.sloop, out = {};
              g.boardSloop(0, -4); out.start = P.local.toArray().map((v) => +v.toFixed(2));
              const walk = (x, z, secs) => { window.__sim(secs, () => { const L = P.local, dx = x - L.x, dz = z - L.z; if (Math.hypot(dx, dz) < 0.25) { g.input.keys.clear(); return; }
                const c = Math.cos(s.heading), sn = Math.sin(s.heading), wx = dx * c + dz * sn, wz = -dx * sn + dz * c; P.yaw = Math.atan2(-wx, -wz); g.input.keys.add('KeyW'); }); g.input.keys.clear(); return P.local.toArray().map((v) => +v.toFixed(2)); };
              out.bow = walk(0, -9.5, 4);
              out.aroundMast = walk(1.4, -1.0, 4);
              out.toHatch = walk(0, 0.5, 4);
              out.downHatch = walk(0, 4.7, 4);
              out.offStairs = walk(2.2, 4.4, 3); out.hold1 = walk(2.2, 0.6, 4); out.hold2 = walk(0.6, -2.0, 4); out.hold = walk(0.2, -4.2, 4);
              out.chestPrompt = (g.computeInteraction() || {}).id;
              out.back1 = walk(0.6, -2.0, 4); out.back2 = walk(2.2, 0.6, 4); out.back3 = walk(2.2, 4.6, 3); out.upHatch = walk(0, 4.6, 3); out.upHatch2 = walk(0, 0.3, 4);
              out.stairs = walk(2.6, 1.0, 3); out.qd = walk(2.6, 6.2, 4);
              out.helm = walk(0, 6.6, 3); out.helmPrompt = (g.computeInteraction() || {}).id;
              out.mast = walk(0.1, -0.2, 6); out.climbPrompt = (g.computeInteraction() || {}).id;
              g.doInteraction({ id: 'climbUp' });
              window.__sim(8, () => { g.input.keys.clear(); g.input.keys.add('KeyW'); }); g.input.keys.clear();
              out.nest = P.local.toArray().map((v) => +v.toFixed(2)); out.climbing = P.climb;
              return out; }''')
            print('B decks:', json.dumps(r))
            await page.evaluate(f'() => {{ const g = {G}; g.player.climb = false; g.boardSloop(0, -6); g.cam && 0; }}')
            await page.wait_for_timeout(300)
            await page.screenshot(path=f'{SHOTS}/t66_deck.png')
            # C) collisions: side by side, ramming, bow to bow
            r = await page.evaluate('''() => { const g = window.__brinebound, B = window.__bs, s = g.sloop, out = {};
              g.player.leaveShip(null); g.player.pos.set(s.pos.x, 40, s.pos.z + 60); g.player.mode = 'foot';
              B.clearAll(); const o = B.open(56); s.place(o.x, o.z, 0); s.speed = 0; s.sailLvl = 0; s.maxHp = 120; s.hp = 120;
              // overlapping alongside: pushed apart to about a hull's width, no deeper
              const a = B.spawn('pirate', o.x + 7, o.z, 0); g.shipCollisions(); g.shipCollisions(); g.shipCollisions();
              out.alongside = { centres: +Math.hypot(a.pos.x - s.pos.x, a.pos.z - s.pos.z).toFixed(2), pen: +B.pen(s, a).toFixed(2) };
              B.clearAll();
              // a ram into the sloop's side at speed
              const r = B.spawn('navy', o.x + 32, o.z - 2, Math.PI / 2); r.speed = 11; r.sailLvl = 1; const hp0 = [s.hp, r.hp];
              let worst = 0; window.__sim(5, () => { worst = Math.max(worst, B.pen(s, r)); });
              out.ram = { worstPen: +worst.toFixed(2), hpLost: [+(hp0[0] - s.hp).toFixed(1), +(hp0[1] - r.hp).toFixed(1)], gap: +Math.hypot(r.pos.x - s.pos.x, r.pos.z - s.pos.z).toFixed(1), speeds: [+s.speed.toFixed(1), +r.speed.toFixed(1)], turned: +(r.heading - Math.PI / 2).toFixed(2) };
              B.clearAll(); s.place(o.x, o.z, 0); s.speed = 0; s.hp = s.maxHp;
              // bow to bow
              const h = B.spawn('merchant', o.x, o.z - 40, Math.PI); h.speed = 9; h.sailLvl = 1; s.speed = 6; s.sailLvl = 0.6;
              worst = 0; window.__sim(5, () => { worst = Math.max(worst, B.pen(s, h)); });
              out.headOn = { worstPen: +worst.toFixed(2), gap: +Math.hypot(h.pos.x - s.pos.x, h.pos.z - s.pos.z).toFixed(1), hpLost: +(s.maxHp - s.hp).toFixed(1) };
              s.hp = s.maxHp;
              B.clearAll(); return out; }''')
            print('C ships:', json.dumps(r))
            # D) land: head on, and glancing along a coast
            r = await page.evaluate('''() => { const g = window.__brinebound, w = g.world, s = g.sloop, SEA = 12, Wd = window.__bs.Wd, out = {};
              const isl = w.islands[3]; s.sailLvl = 1; s.rudder = 0; s.hp = s.maxHp; s.sinking = false;
              // start 70 m out from the island, pointing at its middle
              const a = 0.7, sx = isl.x + Math.cos(a) * (isl.r + 70), sz = isl.z + Math.sin(a) * (isl.r + 70);
              const toward = Math.atan2(-(isl.x - sx), -(isl.z - sz));
              s.place(sx, sz, toward); s.speed = 10;
              let inside = 0, maxPts = 0; window.__sim(14, () => { const c = s.groundContact(w, s.pos.x, s.pos.z, s.heading); if (c) { inside++; maxPts = Math.max(maxPts, c.n); } s.sailLvl = 1; });
              out.headOn = { framesTouching: inside, maxPointsIn: maxPts, hp: +s.hp.toFixed(0), speed: +s.speed.toFixed(1) };
              // glancing: run at 25 degrees to the coast
              s.hp = s.maxHp; const tang = toward + Math.PI / 2 - 0.44;
              const gx = isl.x + Math.cos(a + 0.6) * (isl.r + 45), gz = isl.z + Math.sin(a + 0.6) * (isl.r + 45);
              s.place(gx, gz, Math.atan2(-(isl.x - gx), -(isl.z - gz)) + 1.13); s.speed = 10;
              const h0 = s.heading; let touched = 0, moved = 0, last = [s.pos.x, s.pos.z]; maxPts = 0;
              window.__sim(12, () => { const c = s.groundContact(w, s.pos.x, s.pos.z, s.heading); if (c) { touched++; maxPts = Math.max(maxPts, c.n); } s.sailLvl = 1; s.rudder = 0.35;
                moved += Math.hypot(s.pos.x - last[0], s.pos.z - last[1]); last = [s.pos.x, s.pos.z]; });
              out.glancing = { framesTouching: touched, maxPointsIn: maxPts, distance: +moved.toFixed(0), speed: +s.speed.toFixed(1), headingChange: +(s.heading - h0).toFixed(2), hp: +s.hp.toFixed(0) };
              return out; }''')
            print('D land:', json.dumps(r))
            await page.evaluate(HELPERS)
            await page.evaluate('''() => { const g = window.__brinebound, B = window.__bs, s = g.sloop, o = B.open(44); B.clearAll(); s.place(o.x, o.z, 0.4); s.speed = 0; s.sailLvl = 1;
              const p = B.spawn('pirate', o.x + 11, o.z - 4, 0.4); p.sailLvl = 1; g.shipCollisions();
              g.player.leaveShip(null); g.player.mode = 'foot'; g.player.pos.set(o.x - 22, 21, o.z + 34); g.player.yaw = -0.45; g.player.pitch = -0.32; g.player.vel.set(0, 0, 0); g.player.update = () => {}; }''')
            await page.evaluate('() => window.__sim(0.5)')
            await page.wait_for_timeout(400)
            await page.screenshot(path=f'{SHOTS}/t66_ships.png')
            print('errors:', [l for l in logs if 'error' in l.lower()][:5])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
