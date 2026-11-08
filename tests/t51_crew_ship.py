import asyncio, sys, json, time
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from crewlib import *
G = 'window.__brinebound'
async def wait_for(page, expr, timeout=30, every=0.25):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if await page.evaluate(expr): return True
        except Exception: pass
        await asyncio.sleep(every)
    return False
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    relay = Relay(latency=0.06, drop=0.03)
    try:
        async with async_playwright() as p:
            b, (A, Bp), (la, lb) = await crew_pages(p, relay)
            await asyncio.gather(start_voyage(A, 'Captain Anne'), start_voyage(Bp, 'Captain Bonny'))
            await render(A, False); await render(Bp, False)
            await A.evaluate(f'{G}.net.startHost()')
            await wait_for(Bp, f'{G}.net.crews().length > 0', 10)
            await Bp.evaluate(f"{G}.openSheet('crew')")
            await Bp.click('#sheet button:has-text("Join")')
            print('B joined', await wait_for(Bp, f'{G}.net.inCrew && {G}.state === "play"', 60))
            await A.evaluate(f'{G}.boardSloop(0, -3.6)')
            await Bp.evaluate(f'{G}.boardSloop(0.4, -1.3)')
            await asyncio.sleep(1.5)
            # B mans a gun: the captain's game knows that gun is taken
            r = await Bp.evaluate(f'() => {{ const g = {G}; const it = g.computeInteraction(); if (it && it.id === "gun") g.doInteraction(it); return [it && it.id, g.player.gun]; }}')
            print('B on gun', r)
            gi = r[1]
            busy = await wait_for(A, f'{G}.net.gunBusy({gi}) === "Captain Bonny"', 6)
            print('A sees the gun taken', busy)
            # B fires: the shot is the captain's, and both see it fly
            n0 = await A.evaluate(f'{G}.projectiles.list.length')
            await Bp.evaluate(f'() => {{ const g = {G}; g.inv.ball = 5; g.player.pitch = 0.2; g.input.mouseL = true; }}')
            await asyncio.sleep(0.6)
            await Bp.evaluate(f'() => {{ {G}.input.mouseL = false; }}')
            firedA = await wait_for(A, f'{G}.projectiles.list.length > {n0}', 5, 0.05)
            seenB = await wait_for(Bp, f'{G}.projectiles.list.some(b => b.vis)', 5, 0.05)
            print('B fires: captain fires it', firedA, 'B sees the ball', seenB, 'B balls left', await Bp.evaluate(f'{G}.inv.ball'))
            # B climbs to the crow's nest; the captain sees them up the mast
            await Bp.evaluate(f'() => {{ const g = {G}, P = g.player; P.gun = -1; g.boardSloop(0, 0.0); }}')
            await asyncio.sleep(0.5)
            r = await Bp.evaluate(f'() => {{ const g = {G}; const it = g.computeInteraction(); if (it && it.id === "climbUp") g.doInteraction(it); g.input.keys.add("KeyW"); return it && it.id; }}')
            up = await wait_for(Bp, f'{G}.player.local.y > 9.5', 12)
            await Bp.evaluate(f'() => {{ {G}.input.keys.clear(); }}')
            seen = await wait_for(A, f'[...{G}.net.mates.values()].some(m => m.local.y > 9.3)', 6)
            print('B climbs', r, up, 'A sees B in the nest', seen)
            # the captain's fleet shows up for the crew too
            await A.evaluate(f'() => {{ const g = {G}; g.fleet.spawn("merchant"); g.fleet.spawn("pirate"); g.fleet.spawn("navy"); }}')
            kinds = await wait_for(Bp, f'new Set({G}.hollows.map(h => h.kind)).size >= 3', 8)
            print('B sees the fleet', kinds, await Bp.evaluate(f'{G}.hollows.map(h => [h.kind, h.name])'))
            print('errors', errors(la)[-4:], errors(lb)[-4:])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
