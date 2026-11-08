import asyncio, sys, json, time
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from crewlib import *

G = 'window.__brinebound'

async def wait_for(page, expr, timeout=30, every=0.25):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if await page.evaluate(expr):
                return True
        except Exception as e:
            pass
        await asyncio.sleep(every)
    return False

async def main():
    srv = serve(); await asyncio.sleep(0.8)
    relay = Relay(latency=0.06, drop=0.05)
    try:
        async with async_playwright() as p:
            b, (A, Bp), (la, lb) = await crew_pages(p, relay)
            await asyncio.gather(start_voyage(A, 'Captain Anne'), start_voyage(Bp, 'Captain Bonny'))
            print('both at sea')
            await render(A, False); await render(Bp, False)
            f0 = await A.evaluate(f'{G}.frameN'); g0 = await Bp.evaluate(f'{G}.frameN'); await asyncio.sleep(3)
            print('fps A', (await A.evaluate(f'{G}.frameN') - f0) / 3, 'B', (await Bp.evaluate(f'{G}.frameN') - g0) / 3)
            # B makes a mark on their own world first, so we can check it comes back after
            r = await Bp.evaluate(f'''() => {{ const g = {G}; const sp = g.world.spawn; const x = Math.floor(sp.x) + 2, z = Math.floor(sp.z) + 2, y = g.world.standY(x, z);
              g.world.set(x, y, z, 6); g.gold = 33; return [g.world.edits.size, x, y, z]; }}''')
            b_solo_edits = r[0]
            print('B solo edits', r)
            ok = await A.evaluate(f'{G}.net.startHost()')
            print('host open', ok, await A.evaluate(f'{G}.net.code'))
            ok = await wait_for(Bp, f'{G}.net.crews().length > 0', 10)
            print('B sees crew', ok, await Bp.evaluate(f'{G}.net.crews()'))
            await Bp.evaluate(f"{G}.openSheet('crew')")
            await snap(Bp, 'c_sheet_b')
            await Bp.click('#sheet button:has-text("Join")')
            t0 = time.time()
            ok = await wait_for(Bp, f'{G}.net.inCrew && {G}.state === "play"', 45)
            print('B joined', ok, round(time.time() - t0, 1), 's')
            if not ok:
                print(await Bp.evaluate(f'() => {{ const n = {G}.net; return {{ role: n.role, acc: n.accepted, asm: n.asm && [n.asm.have, n.asm.count], hostSeen: n.hostSeen, me: n.me, host: n.hostPeer, code: n.code, shared: n.shared, got: n.gotSnap }}; }}'))
                print(await A.evaluate(f'() => {{ const n = {G}.net; return {{ role: n.role, crew: [...n.crew.keys()], snap: n.snap && [n.snap.id, n.snap.chunks.length], me: n.me, code: n.code, out: n.out.length }}; }}'))
                print(errors(la)[-5:], errors(lb)[-5:])
                return
            ea = await A.evaluate(f'() => {{ const e = [...{G}.world.edits].sort((a, b) => a[0] - b[0]); return [e.length, JSON.stringify(e).length, e.slice(0, 3)]; }}')
            eb = await Bp.evaluate(f'() => {{ const e = [...{G}.world.edits].sort((a, b) => a[0] - b[0]); return [e.length, JSON.stringify(e).length, e.slice(0, 3)]; }}')
            print('edits A', ea, 'B', eb)
            await asyncio.sleep(1.5)
            print('A mates', await A.evaluate(f'() => [...{G}.net.mates.values()].map(m => [m.name, m.has, m.mode, Math.round(m.pos.x), Math.round(m.pos.z)])'))
            print('B mates', await Bp.evaluate(f'() => [...{G}.net.mates.values()].map(m => [m.name, m.has, m.mode, Math.round(m.pos.x), Math.round(m.pos.z)])'))
            print('A sloop', await A.evaluate(f'() => {{ const s = {G}.sloop; return [s.pos.x.toFixed(2), s.pos.z.toFixed(2), s.heading.toFixed(3)]; }}'))
            print('B sloop', await Bp.evaluate(f'() => {{ const s = {G}.sloop; return [s.pos.x.toFixed(2), s.pos.z.toFixed(2), s.heading.toFixed(3), !!s.remote]; }}'))
            print('B player', await Bp.evaluate(f'() => {{ const P = {G}.player; return [P.mode, P.pos.x.toFixed(1), P.pos.y.toFixed(1), P.pos.z.toFixed(1)]; }}'))
            # block edits both ways
            r = await A.evaluate(f'''() => {{ const g = {G}; const sp = g.world.spawn; const x = Math.floor(sp.x) - 3, z = Math.floor(sp.z) - 1, y = g.world.standY(x, z);
              g.world.set(x, y, z, 7); return [x, y, z]; }}''')
            await asyncio.sleep(1.2)
            got = await Bp.evaluate(f'(c) => {G}.world.get(c[0], c[1], c[2])', r)
            print('A placed id 7 at', r, '-> B sees', got)
            r2 = await Bp.evaluate(f'''() => {{ const g = {G}; const sp = g.world.spawn; const x = Math.floor(sp.x) - 4, z = Math.floor(sp.z) - 2, y = g.world.standY(x, z);
              g.world.set(x, y, z, 9); g.net.req("pl", x, y, z, 9); return [x, y, z]; }}''')
            await asyncio.sleep(1.2)
            got2 = await A.evaluate(f'(c) => {G}.world.get(c[0], c[1], c[2])', r2)
            print('B placed id 6 at', r2, '-> A sees', got2)
            await snap(A, 'c_host_view')
            await snap(Bp, 'c_crew_view')
            # chat
            await Bp.evaluate(f"{G}.net.sendChat('Ahoy, captain! Where to?')")
            await asyncio.sleep(1.2)
            print('A chat', await A.evaluate(f'() => {G}.net.chat.map(c => c.name + ": " + c.t)'))
            print('stats A', await A.evaluate('window.__mockStats'), 'B', await Bp.evaluate('window.__mockStats'))
            # leave and come home
            await Bp.evaluate(f"{G}.net.leave('test leave')")
            ok = await wait_for(Bp, f'!{G}.net.role && {G}.state === "play"', 10)
            r = await Bp.evaluate(f'() => [{G}.world.edits.size, {G}.gold, {G}.net.role]')
            print('B home', ok, r, 'solo edits were', b_solo_edits)
            await asyncio.sleep(4)
            print('A crew after leave', await A.evaluate(f'() => [{G}.net.crew.size, {G}.net.mates.size]'))
            print('errors A', errors(la)[-6:])
            print('errors B', errors(lb)[-6:])
            await b.close()
    finally:
        relay.stop()
        srv.terminate()

asyncio.run(main())
