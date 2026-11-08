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
            r = await page.evaluate(f'''() => {{ const g = {G}; return {{ hotbar: g.hotbar, shot: g.inv.shot, pistol: g.inv.pistol, slot5: document.querySelectorAll('#hotbar .slot')[5].querySelector('.count').textContent }}; }}''')
            print('start', r)
            # a skeleton 8 m in front: two pistol balls
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, I = g.input; g.selectSlot(5);
              const fx = P.pos.x - Math.sin(P.yaw) * 8, fz = P.pos.z - Math.cos(P.yaw) * 8;
              g.enemies.spawnNear(fx, fz, 1, 0, 1.5, {{ kind: 'guard' }});
              const sk = g.enemies.list[g.enemies.list.length - 1];
              window.__sim(1.4, () => {{ P.hp = 100; }});
              const out = {{ hp0: sk.hp }};
              const shoot = () => {{ window.__aimAt(sk.pos.x, sk.pos.y + 1.1, sk.pos.z); I.mouseL = true; window.__sim(0.05, () => {{ window.__aimAt(sk.pos.x, sk.pos.y + 1.1, sk.pos.z); P.hp = 100; }}); I.mouseL = false; window.__sim(0.05, () => {{}}); }};
              shoot(); out.hp1 = sk.hp; out.cd = +g.guns.cd.pistol.toFixed(2); out.shot = g.inv.shot;
              shoot(); out.hp1b = sk.hp;        // still reloading: no shot
              window.__sim(1.6, () => {{ window.__aimAt(sk.pos.x, sk.pos.y + 1.1, sk.pos.z); P.hp = 100; }});
              shoot(); out.hp2 = sk.hp; out.state = sk.state; out.shotLeft = g.inv.shot;
              return out; }}''')
            print('pistol vs skeleton', r)
            await page.evaluate(f'() => {{ const g = {G}; g.guns.cd.pistol = 0; g.input.mouseL = true; window.__sim(0.03, () => {{}}); g.input.mouseL = false; }}')
            await page.wait_for_timeout(120); await shot(page, 't58_pistol_fire')
            # musket: aim down the barrel
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, I = g.input; g.inv.musket = 1; g.hotbar[6] = 'musket'; g.ui.buildHotbar(); g.selectSlot(6);
              I.rightHeld = true; window.__sim(0.6, () => {{}});
              return {{ aim: +g.guns.aim.toFixed(2), fov: +g.camera.fov.toFixed(1) }}; }}''')
            print('musket aim', r)
            await page.wait_for_timeout(200); await shot(page, 't58_musket_aim')
            await page.evaluate(f'() => {{ const g = {G}; g.input.rightHeld = false; window.__sim(0.5, () => {{}}); }}')
            await page.wait_for_timeout(150); await shot(page, 't58_musket_hip')
            # a powder keg 10 m off: shoot it
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, I = g.input, w = g.world;
              P.pitch = 0; const ex = P.pos.x, ez = P.pos.z, ey = Math.floor(P.pos.y + 1.6);
              const kx = Math.floor(ex - Math.sin(P.yaw) * 7), kz = Math.floor(ez - Math.cos(P.yaw) * 7), ky = ey;
              for (let t = 1.5; t < 7.6; t += 0.3) {{ const x = Math.floor(ex - Math.sin(P.yaw) * t), z = Math.floor(ez - Math.cos(P.yaw) * t); for (let y = ey - 1; y <= ey + 1; y++) w.set(x, y, z, 0, true); }}
              w.set(kx, ky - 1, kz, 4, true); w.set(kx, ky, kz, 45, true); window.__sim(0.1, () => {{}});
              g.guns.cd.musket = 0; window.__aimAt(kx + 0.5, ky + 0.5, kz + 0.5);
              const ar = g.aimRay(); const tr = g.guns.trace(ar.o.clone(), ar.d.clone(), 95);
              const vr = w.raycast(ar.o.x, ar.o.y, ar.o.z, ar.d.x, ar.d.y, ar.d.z, 95, false, true), pk = w.pick(ar.o.x, ar.o.y, ar.o.z, ar.d.x, ar.d.y, ar.d.z, 95);
              const dbg = {{ kind: tr.kind, t: +tr.t.toFixed(2), hit: tr.hit ? [tr.hit.x, tr.hit.y, tr.hit.z, g.world.get(tr.hit.x, tr.hit.y, tr.hit.z)] : null, keg: [kx, ky, kz], eye: ar.o.toArray().map((v) => +v.toFixed(2)), d: ar.d.toArray().map((v) => +v.toFixed(3)), vr: vr && [vr.x, vr.y, vr.z, +vr.t.toFixed(2)], pk: pk && [pk.x, pk.y, pk.z, +pk.t.toFixed(2), !!pk.terrain], kegId: w.get(kx, ky, kz) }};
              I.mouseL = true; window.__sim(0.04, () => {{ window.__aimAt(kx + 0.5, ky + 0.5, kz + 0.5); }}); I.mouseL = false;
              
              window.__sim(3.5, () => {{ P.hp = 100; }});
              return {{ dbg, after: w.get(kx, ky, kz) }}; }}''')
            print('keg', r)
            # blunderbuss into a group of skeletons
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, I = g.input; g.inv.blunderbuss = 1; g.hotbar[7] = 'blunderbuss'; g.ui.buildHotbar(); g.selectSlot(7);
              for (const s of g.enemies.list) s.dead = true; window.__sim(0.1, () => {{}});
              const fx = P.pos.x - Math.sin(P.yaw) * 4, fz = P.pos.z - Math.cos(P.yaw) * 4;
              g.enemies.spawnNear(fx, fz, 3, 0, 1.2, {{ kind: 'guard' }}); window.__sim(1.4, () => {{ P.hp = 100; }});
              const live = g.enemies.list.filter((s) => s.state !== 'dying');
              const hp0 = live.map((s) => s.hp);
              const c = live[0]; window.__aimAt(c.pos.x, c.pos.y + 1.0, c.pos.z); I.mouseL = true; window.__sim(0.04, () => {{ window.__aimAt(c.pos.x, c.pos.y + 1.0, c.pos.z); }}); I.mouseL = false;
              return {{ hp0, hp1: live.map((s) => Math.round(s.hp)) }}; }}''')
            print('blunderbuss', r)
            # third person with a musket
            await page.evaluate(f'() => {{ const g = {G}; g.selectSlot(6); g.toggleView(); g.player.pitch = 0; window.__sim(0.5, () => {{}}); }}')
            await page.wait_for_timeout(150); await shot(page, 't58_musket_3p')
            await page.evaluate(f'() => {{ const g = {G}; g.toggleView(); }}')
            # craft shot from a cannonball (recipe 6)
            r = await page.evaluate(f'''() => {{ const g = {G}; const s0 = g.inv.shot, b0 = g.inv.ball; const ok = g.craft(6); return {{ ok, shot: g.inv.shot - s0, ball: g.inv.ball - b0 }}; }}''')
            print('craft shot', r)
            print('errors', [l for l in logs if 'error' in l.lower()][:6])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
