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
    relay = Relay(latency=0.08, drop=0.05)
    try:
        async with async_playwright() as p:
            b, pages, logs = await crew_pages(p, relay, n=3, w=640, h=360)
            A, Bp, C = pages
            await asyncio.gather(start_voyage(A, 'Captain Anne'), start_voyage(Bp, 'Captain Bonny'), start_voyage(C, 'Captain Calico'))
            for pg in pages: await render(pg, False)
            # Anne digs a little before anyone joins, so the snapshot has something in it
            await A.evaluate(f'''() => {{ const g = {G}, sp = g.world.spawn; for (let i = 0; i < 40; i++) {{ const x = Math.floor(sp.x) + (i % 8) - 4, z = Math.floor(sp.z) + Math.floor(i / 8) + 3; const y = g.world.standY(x, z) - 1; g.world.set(x, y, z, 0); }} }}''')
            await A.evaluate(f'{G}.net.startHost()')
            for pg in (Bp, C):
                assert await wait_for(pg, f'{G}.net.crews().length > 0', 10)
            await asyncio.gather(Bp.evaluate(f'() => {G}.net.join({G}.net.crews()[0])'), C.evaluate(f'() => {G}.net.join({G}.net.crews()[0])'))
            okb = await wait_for(Bp, f'{G}.net.inCrew && {G}.state === "play"', 45)
            okc = await wait_for(C, f'{G}.net.inCrew && {G}.state === "play"', 45)
            print('both joined', okb, okc)
            await asyncio.sleep(2.5)
            for name, pg in (('A', A), ('B', Bp), ('C', C)):
                print(name, 'sees', await pg.evaluate(f'() => [...{G}.net.mates.values()].filter(m => m.has).map(m => m.name)'), 'edits', await pg.evaluate(f'{G}.world.edits.size'))
            # one more edit while all three are in: everyone converges
            await C.evaluate(f'''() => {{ const g = {G}, sp = g.world.spawn; const x = Math.floor(sp.x) + 6, z = Math.floor(sp.z) - 6; const y = g.world.standY(x, z); g.world.set(x, y, z, 9); g.net.req('pl', x, y, z, 9); }}''')
            await asyncio.sleep(2)
            sums = []
            for pg in pages:
                sums.append(await pg.evaluate(f'() => {{ let h = 0; for (const [i, id] of [...{G}.world.edits].sort((a, b) => a[0] - b[0])) h = (h * 31 + i * 7 + id) % 1000000007; return [{G}.world.edits.size, h]; }}'))
            print('edit sums', sums, 'same' if len(set(map(tuple, sums))) == 1 else 'DIFFERENT')
            await C.evaluate(f"{G}.net.sendChat('Calico here!')")
            await asyncio.sleep(1.5)
            print('B heard', await Bp.evaluate(f'() => {G}.net.chat.map(c => c.name + ": " + c.t)'))
            print('A presence max bytes', await A.evaluate('window.__mockStats.maxBytes'), 'rejected', await A.evaluate('window.__mockStats.rejected'))
            for name, lg in zip('ABC', logs): print('errors', name, errors(lg)[-4:])
            await b.close()
    finally:
        relay.stop(); srv.terminate()
asyncio.run(main())
