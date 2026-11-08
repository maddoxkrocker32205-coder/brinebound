import asyncio, sys, time
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from crewlib import *
G = 'window.__brinebound'
async def wait_for(page, expr, timeout=30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if await page.evaluate(expr): return True
        except Exception: pass
        await asyncio.sleep(0.25)
    return False
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    relay = Relay(latency=0.1, drop=0.1)
    try:
        async with async_playwright() as p:
            b, (A, Bp), (la, lb) = await crew_pages(p, relay, w=640, h=360)
            await asyncio.gather(start_voyage(A, 'Captain Anne'), start_voyage(Bp, 'Captain Bonny'))
            await render(A, False); await render(Bp, False)
            # a long-played world: thousands of edits scattered everywhere
            n = await A.evaluate(f'''() => {{ const g = {G}, w = g.world; let n = 0;
              for (let k = 0; k < 9000; k++) {{ const x = 10 + Math.floor(Math.random() * 360), z = 10 + Math.floor(Math.random() * 360); const y = 4 + Math.floor(Math.random() * 30);
                w.set(x, y, z, [0, 9, 4, 15, 18][k % 5]) && n++; }} w.processDirty(9999); return w.edits.size; }}''')
            print('host edits', n)
            await A.evaluate(f'{G}.net.startHost()')
            assert await wait_for(Bp, f'{G}.net.crews().length > 0', 10)
            # the captain is in a brawl at sea while the crew member rows out
            await A.evaluate(f'''() => {{ const g = {G}; g.time = 250; g.boardSloop(0, 2); g.startKraken(); g.spawnHollow({{}}); g.spawnHollow({{}});
              const s = g.sloop; g.enemies.spawnNear(g.world.spawn.x, g.world.spawn.z, 20, 2, 12, {{ kind: 'guard' }}); }}''')
            t0 = time.time()
            await Bp.evaluate(f'() => {G}.net.join({G}.net.crews()[0])')
            # keep the captain busy: explosions every half second
            async def boom():
                for i in range(40):
                    await A.evaluate(f'''() => {{ const g = {G}, sp = g.world.spawn; g.explode(sp.x + Math.random() * 30 - 15, 15 + Math.random() * 3, sp.z + Math.random() * 30 - 15, 1.6, true); }}''')
                    await asyncio.sleep(0.4)
            task = asyncio.ensure_future(boom())
            ok = await wait_for(Bp, f'{G}.net.inCrew && {G}.state === "play"', 60)
            print('joined under load', ok, round(time.time() - t0, 1), 's')
            # put the crew member ashore among the skeletons so they are all sent
            await Bp.evaluate(f'''() => {{ const g = {G}, P = g.player, sp = g.world.spawn; if (P.mode !== 'foot') P.leaveShip(g.sloop); P.mode = 'foot'; P.pos.set(sp.x, g.world.standY(Math.floor(sp.x), Math.floor(sp.z)) + 0.01, sp.z); }}''')
            await task
            await asyncio.sleep(3)
            sums = []
            for pg in (A, Bp):
                sums.append(await pg.evaluate(f'() => {{ let h = 0; for (const [i, id] of [...{G}.world.edits].sort((a, b) => a[0] - b[0])) h = (h * 31 + i * 7 + id) % 1000000007; return [{G}.world.edits.size, h]; }}'))
            print('edits converge', sums, 'same' if sums[0] == sums[1] else 'DIFFERENT')
            print('B sees skeletons', await Bp.evaluate(f'{G}.enemies.list.length'), 'of', await A.evaluate(f'{G}.enemies.list.length'), '| kraken', await Bp.evaluate(f'!!{G}.kraken'), '| hollows', await Bp.evaluate(f'{G}.hollows.length'))
            print('presence A max', await A.evaluate('window.__mockStats.maxBytes'), 'rejected', await A.evaluate('window.__mockStats.rejected'), '| B max', await Bp.evaluate('window.__mockStats.maxBytes'), 'rejected', await Bp.evaluate('window.__mockStats.rejected'))
            print('host log length', await A.evaluate(f'{G}.net.out.length'), 'B resyncs', await Bp.evaluate(f'{G}.net.rs'))
            print('errors A', errors(la)[-4:]); print('errors B', errors(lb)[-4:])
            await b.close()
    finally:
        relay.stop(); srv.terminate()
asyncio.run(main())
