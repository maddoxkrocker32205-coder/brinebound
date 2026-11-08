import asyncio, sys, json, time, math
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from crewlib import *
from simlib import SIM

G = 'window.__brinebound'

async def wait_for(page, expr, timeout=30, every=0.25):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if await page.evaluate(expr):
                return True
        except Exception:
            pass
        await asyncio.sleep(every)
    return False

async def join(A, Bp):
    await A.evaluate(f'{G}.net.startHost()')
    assert await wait_for(Bp, f'{G}.net.crews().length > 0', 10)
    await Bp.evaluate(f'() => {G}.net.join({G}.net.crews()[0])')
    assert await wait_for(Bp, f'{G}.net.inCrew && {G}.state === "play"', 45), 'join failed'

async def main():
    srv = serve(); await asyncio.sleep(0.8)
    relay = Relay(latency=0.07, drop=0.08)
    try:
        async with async_playwright() as p:
            b, (A, Bp), (la, lb) = await crew_pages(p, relay)
            await asyncio.gather(start_voyage(A, 'Captain Anne'), start_voyage(Bp, 'Captain Bonny'))
            await render(A, False); await render(Bp, False)
            await A.evaluate(SIM); await Bp.evaluate(SIM)
            await join(A, Bp)
            bme = await Bp.evaluate(f'{G}.net.me')
            print('joined; B peer', bme)

            # ---------------- sail together, out in open water
            await A.evaluate(f'''() => {{ const g = {G}, s = g.sloop, w = g.world;
              let spot = null; for (let k = 0; k < 4000 && !spot; k++) {{ const x = 40 + Math.random() * 300, z = 40 + Math.random() * 300; let ok = true;
                for (let dx = -24; dx <= 24 && ok; dx += 6) for (let dz = -24; dz <= 24 && ok; dz += 6) if (w.solid(Math.floor(x + dx), 11, Math.floor(z + dz)) || w.solid(Math.floor(x + dx), 12, Math.floor(z + dz))) ok = false;
                if (ok) spot = {{ x, z }}; }}
              s.place(spot.x, spot.z, 0.6); g.boardSloop(0, 2); g.doInteraction({{ id: 'helm' }}); s.sailLvl = 1; }}''')
            await asyncio.sleep(1.0)
            await Bp.evaluate(f'''() => {{ const g = {G}; g.boardSloop(0.8, -0.5); }}''')
            for i in range(4):
                await asyncio.sleep(1.5)
                if i == 1:
                    await A.evaluate(f'() => {{ {G}.input.keys.add("KeyA"); }}')
                a = await A.evaluate(f'() => {{ const g = {G}, s = g.sloop, m = [...g.net.mates.values()][0]; const l = s.toLocal(m.pos.x, m.pos.z, {{}}); return [s.pos.x, s.pos.z, s.heading, s.speed, s.rudder, m.mode, l.x, l.z]; }}')
                bb = await Bp.evaluate(f'() => {{ const g = {G}, s = g.sloop, P = g.player, h = [...g.net.mates.values()].find(m => m.role === "host"); const l = s.toLocal(h.pos.x, h.pos.z, {{}}); return [s.pos.x, s.pos.z, s.heading, s.speed, P.mode, P.local.x, P.local.z, l.x, l.z]; }}')
                print('A sloop %.1f,%.1f h%.2f v%.1f r%.2f | A sees B %s at local %.2f,%.2f' % tuple(a))
                print('B sloop %.1f,%.1f h%.2f v%.1f | B %s local %.2f,%.2f | B sees captain at local %.2f,%.2f' % tuple(bb))
            await A.evaluate(f'() => {{ {G}.input.keys.clear(); }}')
            await snap(Bp, 's_crew_deck')
            await A.evaluate(f'() => {{ {G}.camMode = "third"; }}')
            await snap(A, 's_host_helm')

            # ---------------- hand over the wheel
            await A.evaluate(f'''() => {{ const g = {G}; g.doInteraction({{ id: 'leaveHelm' }}); g.player.local.set(-1.2, 1.1, 1.0); }}''')
            await asyncio.sleep(0.8)
            r = await Bp.evaluate(f'''() => {{ const g = {G}, P = g.player; P.local.set(0, 2.25, 3.45); P.syncDeckWorld(g.sloop); const it = g.computeInteraction(); g.doInteraction(it); g.input.keys.add('KeyD'); g.input.keys.add('KeyW'); return [it && it.id, P.mode]; }}''')
            print('B at the wheel:', r)
            await asyncio.sleep(3)
            r = await A.evaluate(f'() => [{G}.net.helmPeer, {G}.sloop.rudder.toFixed(2), {G}.sloop.sailLvl.toFixed(2), {G}.computeInteraction() && {G}.computeInteraction().label]')
            print('A: helm peer', r[0] == bme, 'rudder', r[1], 'sail', r[2])
            await A.evaluate(f'() => {{ {G}.player.local.set(0, 1.1, 3.3); }}')
            await asyncio.sleep(0.3)
            print('A at the wheel sees:', await A.evaluate(f'() => {{ const it = {G}.computeInteraction(); return it && it.label; }}'))
            await Bp.evaluate(f'''() => {{ const g = {G}; g.input.keys.clear(); g.doInteraction({{ id: 'leaveHelm' }}); }}''')
            await asyncio.sleep(1)
            print('after B leaves helm, A helm peer:', await A.evaluate(f'{G}.net.helmPeer'), 'sail', await A.evaluate(f'{G}.sloop.sailLvl'))

            # ---------------- broadside requested by the crew
            await Bp.evaluate(f'''() => {{ const g = {G}, P = g.player; P.local.set(0, 2.25, 3.45); g.doInteraction(g.computeInteraction()); g.inv.ball = 10; }}''')
            await asyncio.sleep(1.2)
            await Bp.evaluate(f'() => {G}.playerFire(1)')
            await asyncio.sleep(1.5)
            print('B shot left', await Bp.evaluate(f'{G}.inv.ball'), '(10 before); A balls flying', await A.evaluate(f'{G}.projectiles.list.length'), 'B sees', await Bp.evaluate(f'{G}.projectiles.list.filter(b => b.vis).length'))
            await Bp.evaluate(f'''() => {{ const g = {G}; g.doInteraction({{ id: 'leaveHelm' }}); }}''')

            # ---------------- a ghost ship hunts the crew
            ok = await A.evaluate(f'() => !!{G}.spawnHollow({{}})')
            await asyncio.sleep(1.5)
            print('hollow spawned', ok, '| B sees hollows', await Bp.evaluate(f'{G}.hollows.length'))
            ha = await A.evaluate(f'() => {{ const h = {G}.hollows[0]; return [h.pos.x, h.pos.z]; }}')
            hb = await Bp.evaluate(f'() => {{ const h = {G}.hollows[0]; return [h.pos.x, h.pos.z, !!h.remote]; }}')
            print('hollow A %.1f,%.1f  B %.1f,%.1f remote=%s' % (ha[0], ha[1], hb[0], hb[1], hb[2]))
            await A.evaluate(f'() => {{ const g = {G}; for (const h of g.hollows) h.dispose(); g.hollows = []; }}')

            # ---------------- the kraken
            await A.evaluate(f'() => {G}.startKraken()')
            await asyncio.sleep(2)
            kb = await Bp.evaluate(f'() => {{ const k = {G}.kraken; return k ? [!!k.remote, k.tentacles.length, k.tentacles.filter(t => t.alive).length] : null; }}')
            print('B sees kraken', kb)
            tid = await Bp.evaluate(f'() => {G}.kraken.tentacles[0].netId')
            hp0 = await A.evaluate(f'(id) => {G}.kraken.tentacles.find(t => t.nid === id).hp', tid)
            for i in range(3):
                await Bp.evaluate(f'(id) => {G}.net.req("kt", id, 9)', tid)
                await asyncio.sleep(0.15)
            await asyncio.sleep(1.2)
            hp1 = await A.evaluate(f'(id) => {G}.kraken.tentacles.find(t => t.nid === id).hp', tid)
            print('tentacle hp on A', hp0, '->', hp1)
            await snap(Bp, 's_crew_kraken')
            await A.evaluate(f'() => {{ {G}.killKraken(); {G}.weather.forced = 0; }}')
            await asyncio.sleep(1.2)
            print('kraken gone on B:', await Bp.evaluate(f'!{G}.kraken'))

            # ---------------- ashore: skeletons chase the crew member
            await A.evaluate(f'''() => {{ const g = {G}, P = g.player; P.leaveShip(g.sloop); P.mode = 'foot'; const sp = g.world.spawn; P.pos.set(sp.x, g.world.standY(Math.floor(sp.x), Math.floor(sp.z)) + 0.01, sp.z); g.sloop.sailLvl = 0; g.sloop.speed = 0; }}''')
            spot = await Bp.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, o = w.islands[0];
              P.leaveShip(g.sloop); P.mode = 'foot';
              for (let k = 0; k < 400; k++) {{ const a = Math.random() * 6.28, r = Math.random() * o.r * 0.6; const x = Math.floor(o.x + Math.cos(a) * r), z = Math.floor(o.z + Math.sin(a) * r);
                const y = w.standY(x, z); if (y > 13 && y < 22 && !g.isProtected(x, y, z) && Math.hypot(x - w.spawn.x, z - w.spawn.z) > 12) {{ P.pos.set(x + 0.5, y + 0.01, z + 0.5); break; }} }}
              P.hp = P.maxHp; g.gold = 0; return [P.pos.x, P.pos.y, P.pos.z, P.inWater]; }}''')
            print('B ashore at', [round(v, 1) if isinstance(v, float) else v for v in spot])
            await asyncio.sleep(1.5)
            bpos = await Bp.evaluate(f'() => [{G}.player.pos.x, {G}.player.pos.z]')
            n = await A.evaluate(f'(p) => {G}.enemies.spawnNear(p[0], p[1], 1, 4, 6, {{ kind: "guard" }})', bpos)
            print('A spawned guard near B:', n)
            ok = await wait_for(Bp, f'{G}.enemies.list.length > 0', 6)
            print('B sees skeleton', ok)
            await asyncio.sleep(3)
            print('B hp after the guard closed in:', await Bp.evaluate(f'Math.round({G}.player.hp)'), '| A sees guard chasing:', await A.evaluate(f'() => {{ const s = {G}.enemies.list[0], m = [...{G}.net.mates.values()][0]; return s ? Math.hypot(s.pos.x - m.pos.x, s.pos.z - m.pos.z).toFixed(1) : null; }}'))
            await snap(Bp, 's_crew_fight')
            t0 = time.time()
            killed = False
            while time.time() - t0 < 25:
                st = await Bp.evaluate(f'''() => {{ const g = {G}, P = g.player; const s = g.enemies.list.find(q => q.state !== 'dying');
                  if (!s) return null; window.__aimAt(s.pos.x, s.pos.y + 1.1, s.pos.z); g.selectSlot(0); P.hp = Math.max(P.hp, 40);
                  const d = Math.hypot(s.pos.x - P.pos.x, s.pos.z - P.pos.z); g.input.mouseL = d < 3; g.input.keys.clear(); if (d > 2) g.input.keys.add('KeyW');
                  return d; }}''')
                if await A.evaluate(f'{G}.enemies.list.filter(s => s.state !== "dying").length === 0'):
                    killed = True
                    break
                await asyncio.sleep(0.1)
            await Bp.evaluate(f'() => {{ {G}.input.mouseL = false; {G}.input.keys.clear(); }}')
            await asyncio.sleep(1.2)
            print('skeleton killed by crew', killed, 'in', round(time.time() - t0, 1), 's; B gold', await Bp.evaluate(f'{G}.gold'), 'bones', await Bp.evaluate(f'{G}.inv.bone || 0'))

            # ---------------- salvage reached by the crew member
            bpos = await Bp.evaluate(f'() => [{G}.player.pos.x, {G}.player.pos.z]')
            g0 = await Bp.evaluate(f'{G}.gold')
            await A.evaluate(f'(p) => {G}.props.spawnLoot(p[0] + 1, p[1] + 1, 100)', bpos)
            await asyncio.sleep(1.5)
            print('salvage: B gold', g0, '->', await Bp.evaluate(f'{G}.gold'), '; A loot left', await A.evaluate(f'{G}.props.loot.length'))

            # ---------------- death and respawn on the captain's deck
            for i in range(3):
                await A.evaluate(f'(peer) => {G}.net.hurtPeer(peer, 60, null)', bme)
            await asyncio.sleep(1.2)
            print('B alive after big hit:', await Bp.evaluate(f'{G}.player.alive'))
            await asyncio.sleep(4)
            print('B respawned:', await Bp.evaluate(f'() => [{G}.player.alive, {G}.player.mode, Math.round({G}.player.hp)]'))

            # ---------------- the captain closes the voyage
            await A.evaluate(f'() => {G}.net.closeHost()')
            ok = await wait_for(Bp, f'!{G}.net.role && {G}.state === "play"', 15)
            print('B back home after captain closed:', ok, await Bp.evaluate(f'() => [{G}.gold, {G}.world.edits.size, !!{G}.sloop && !{G}.sloop.remote]'))
            print('presence sizes A', await A.evaluate('window.__mockStats'), 'B', await Bp.evaluate('window.__mockStats'), 'relay dropped', relay.dropped)
            print('errors A', errors(la)[-6:])
            print('errors B', errors(lb)[-6:])
            await b.close()
    finally:
        relay.stop()
        srv.terminate()

asyncio.run(main())
