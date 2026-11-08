import asyncio, sys, json, time, math
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from crewlib import *
from simlib import SIM

G = 'window.__brinebound'
FALLBACK = '--shared' in sys.argv

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

async def main():
    srv = serve(); await asyncio.sleep(0.8)
    relay = Relay(latency=0.06, drop=0.05)
    try:
        async with async_playwright() as p:
            b, (A, Bp), (la, lb) = await crew_pages(p, relay, w=1100, h=620, quality='medium', extra_init='\nwindow.__mockNoRooms = true;' if FALLBACK else '')
            await asyncio.gather(start_voyage(A, 'Captain Anne'), start_voyage(Bp, 'Captain Bonny'))
            await render(A, False); await render(Bp, False)
            await A.evaluate(SIM); await Bp.evaluate(SIM)
            # give Bonny a different look and a parrot, so the two are easy to tell apart
            await Bp.evaluate(f'() => {{ const g = {G}; Object.assign(g.look, {{ coat: 1, hat: 1, hair: 5, beard: 0, skin: 3 }}); g.pet = {{ color: 2 }}; g.avatar.setPet(g.pet); g.applyLook("all"); }}')
            await A.evaluate(f'{G}.net.startHost()')
            assert await wait_for(Bp, f'{G}.net.crews().length > 0', 10)
            await Bp.evaluate(f'() => {G}.net.join({G}.net.crews()[0])')
            ok = await wait_for(Bp, f'{G}.net.inCrew && {G}.state === "play"', 45)
            print('joined', ok, 'shared lobby' if await Bp.evaluate(f'{G}.net.shared') else 'named room')
            # face each other on the beach
            await A.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, sp = w.spawn;
              P.mode = 'foot'; P.pos.set(sp.x, w.standY(Math.floor(sp.x), Math.floor(sp.z)) + 0.01, sp.z); P.yaw = sp.yaw; P.pitch = -0.12; g.camMode = 'third'; g.selectSlot(0); }}''')
            await Bp.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world, sp = w.spawn;
              const x = sp.x - Math.sin(sp.yaw) * 6, z = sp.z - Math.cos(sp.yaw) * 6;
              P.mode = 'foot'; P.pos.set(x, w.standY(Math.floor(x), Math.floor(z)) + 0.01, z); P.yaw = sp.yaw + Math.PI; P.pitch = -0.12; g.camMode = 'third'; g.selectSlot(1); }}''')
            await asyncio.sleep(1.5)
            await A.evaluate(f"{G}.net.sendChat('Ahoy, Bonny! Grab an oar.')")
            await asyncio.sleep(1.0)
            await Bp.evaluate(f"{G}.net.sendChat('Aye aye!')")
            await asyncio.sleep(0.8)
            await snap(A, 'l_host_sees')
            await snap(Bp, 'l_crew_sees')
            await Bp.evaluate(f"{G}.openSheet('map')")
            await snap(Bp, 'l_crew_map')
            await Bp.evaluate(f"{G}.closeSheet()")
            # the crew member's autosave is their own voyage with today's gold in it
            await Bp.evaluate(f'() => {{ {G}.gold = 77; }}')
            await Bp.evaluate(f"{G}.autosave('test', true)")
            doc = await Bp.evaluate("JSON.parse(localStorage.getItem('brinebound-v2-auto'))")
            print('crew autosave: gold', doc['data']['gold'], 'edits', doc['data']['edits'].get('n'), 'name', doc['meta']['name'], 'ship look', doc['data']['look'].get('ship'))
            # a wreck's strongbox opened by the crew member
            site = await A.evaluate(f'() => {{ const l = {G}.world.sites.loot.find(l => l.kind === "wreck" && {G}.world.get(l.x, l.y, l.z) === 10); return l ? [l.x, l.y, l.z] : null; }}')
            if site:
                g0 = await Bp.evaluate(f'{G}.gold')
                await Bp.evaluate(f'(c) => {{ {G}.breakBlock(c[0], c[1], c[2], 10); }}', site)
                await asyncio.sleep(1.5)
                print('wreck chest: crew gold', g0, '->', await Bp.evaluate(f'{G}.gold'), 'grog', await Bp.evaluate(f'{G}.inv.grog'), '| host block', await A.evaluate(f'(c) => {G}.world.get(c[0], c[1], c[2])', site))
            # the quartermaster serves a visiting pirate
            await Bp.evaluate(f"{G}.openSheet('npc', {{ npc: 'mags' }})")
            await snap(Bp, 'l_crew_mags')
            await Bp.evaluate(f"{G}.openSheet('quests')")
            await snap(Bp, 'l_crew_quests')
            await Bp.evaluate(f"{G}.closeSheet()")
            # the captain's menu does not stop the world for the crew
            await A.evaluate(f"{G}.openSheet('map')")
            t0 = await Bp.evaluate(f'{G}.time')
            h0 = await A.evaluate(f'{G}.time')
            await asyncio.sleep(2)
            print('with the captain in a menu: captain clock', round(await A.evaluate(f'{G}.time') - h0, 1), 'crew clock', round(await Bp.evaluate(f'{G}.time') - t0, 1))
            await A.evaluate(f"{G}.openSheet('crew')")
            await snap(A, 'l_host_crewsheet')
            await A.evaluate(f"{G}.closeSheet()")
            # quit to title as crew: the next Continue is your own voyage
            await Bp.evaluate(f"{G}.quitToTitle()")
            await asyncio.sleep(1)
            st = await Bp.evaluate(f'() => [{G}.state, {G}.net.role, !!{G}.sloop && !{G}.sloop.remote]')
            print('crew quit to title', st)
            await Bp.evaluate(f"{G}.continueLatest()")
            ok = await wait_for(Bp, f'{G}.state === "play"', 15)
            print('continue after crew session', ok, await Bp.evaluate(f'() => [{G}.gold, {G}.world.edits.size, {G}.look.name]'))
            await asyncio.sleep(5)
            print('host after crew quit', await A.evaluate(f'() => [{G}.net.crew.size, {G}.net.mates.size]'))
            print('stats', await A.evaluate('window.__mockStats'), await Bp.evaluate('window.__mockStats'))
            print('errors A', errors(la)[-6:])
            print('errors B', errors(lb)[-6:])
            await b.close()
    finally:
        relay.stop()
        srv.terminate()

asyncio.run(main())
