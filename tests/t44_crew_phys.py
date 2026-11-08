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
FIND_TREE = '''(g, near) => { const w = g.world; let best = null;
  for (let x = Math.floor(near.x) - 40; x < near.x + 40; x++) for (let z = Math.floor(near.z) - 40; z < near.z + 40; z++) for (let y = 12; y < 28; y++) {
    const id = w.get(x, y, z); if ((id === 5 || id === 7) && w.get(x, y - 1, z) !== id && w.get(x, y + 1, z) === id && w.get(x, y - 1, z) !== 0) { const d = Math.hypot(x - near.x, z - near.z); if (!best || d < best.d) best = { x, y, z, id, d }; } }
  return best; }'''
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
            ok = await wait_for(Bp, f'{G}.net.inCrew && {G}.state === "play"', 45)
            print('B joined', ok)
            # put both on the home island, a few metres apart
            spot = await A.evaluate(f'() => {{ const g = {G}, w = g.world; const o = w.islands.find(o => o.type === "forest" && !w.isReserved(Math.floor(o.x), Math.floor(o.z), 8)) || w.islands[1]; return {{ x: o.x, z: o.z, name: o.name }}; }}')
            print('island', spot)
            for pg, dx in ((A, 0), (Bp, 3)):
                await pg.evaluate(f'() => {{ const g = {G}, P = g.player, x = {spot["x"]} + {dx}, z = {spot["z"]}; P.mode = "foot"; P.pos.set(x, g.world.groundUnder(x, 39, z), z); P.vel.set(0, 0, 0); }}')
            await asyncio.sleep(1.5)
            # 1. the captain fells a tree: the crew member sees it come down
            t = await A.evaluate(f'() => {{ const g = {G}; const t = ({FIND_TREE})(g, g.player.pos); if (!t) return null; g.breakBlock(t.x, t.y, t.z, t.id); return t; }}')
            print('A chops', t)
            seen = await wait_for(Bp, f'{G}.physics.fallers.length > 0', 6, 0.1)
            gone = await wait_for(Bp, f'{G}.world.get({t["x"]}, {t["y"] + 1}, {t["z"]}) === 0', 8)
            print('B sees the fall', seen, 'trunk gone on B', gone)
            # 2. the crew member fells one: the captain's world brings it down, the crew member gets the wood
            t2 = await Bp.evaluate(f'() => {{ const g = {G}; const t = ({FIND_TREE})(g, {{ x: g.player.pos.x + 12, z: g.player.pos.z + 6 }}); if (!t) return null; window.__w0 = g.inv.wood || 0; g.breakBlock(t.x, t.y, t.z, t.id); return t; }}')
            print('B chops', t2)
            if t2:
                fallA = await wait_for(A, f'{G}.physics.fallers.length > 0 || {G}.world.get({t2["x"]}, {t2["y"] + 1}, {t2["z"]}) === 0', 6, 0.1)
                fallB = await wait_for(Bp, f'{G}.physics.fallers.length > 0', 6, 0.1)
                wood = await wait_for(Bp, f'({G}.inv.wood || 0) > window.__w0 + 1', 10)
                print('A brings it down', fallA, 'B sees it', fallB, 'B got wood', wood, await Bp.evaluate(f'[window.__w0, {G}.inv.wood]'))
            # 3. a keg the crew member lights blows up in the captain's world, and both see it
            k = await A.evaluate(f'() => {{ const g = {G}, P = g.player, w = g.world; const x = Math.floor(P.pos.x) + 6, z = Math.floor(P.pos.z) - 5; const y = Math.floor(w.groundUnder(x + 0.5, 39, z + 0.5) + 0.2); w.set(x, y, z, 45); w.set(x + 1, y, z, 9); w.set(x + 1, y + 1, z, 9); return [x, y, z]; }}')
            await wait_for(Bp, f'{G}.world.get({k[0]}, {k[1]}, {k[2]}) === 45', 6)
            await Bp.evaluate(f'{G}.lightKeg({k[0]}, {k[1]}, {k[2]})')
            lit = await wait_for(A, f'{G}.physics.kegs.size > 0', 5, 0.1)
            boomA = await wait_for(A, f'{G}.world.get({k[0]}, {k[1]}, {k[2]}) === 0', 6, 0.1)
            puffB = await wait_for(Bp, f'{G}.physics.puffs.list.length > 3', 6, 0.1)
            planksGone = await wait_for(Bp, f'{G}.world.get({k[0] + 1}, {k[1]}, {k[2]}) === 0', 6)
            print('keg lit on A', lit, 'boom on A', boomA, 'B sees smoke', puffB, 'crater reaches B', planksGone)
            # 4. the crew member builds: a floor and a wall reach the captain's world
            r = await Bp.evaluate(f'''() => {{ const g = {G}, P = g.player, w = g.world; const x = Math.floor(P.pos.x) - 4, z = Math.floor(P.pos.z) + 3; const y = Math.floor(w.groundUnder(x + 0.5, 39, z + 0.5) + 0.55);
              for (const [id, yy] of [[144, y], [128 + 16 + 4, y]]) {{ w.set(x, yy, z, id); g.net.req('pl', x, yy, z, id); }}
              w.set(x + 1, y + 1, z, 192); g.net.req('pl', x + 1, y + 1, z, 192);
              return [x, y, z]; }}''')
            got = await wait_for(A, f'{G}.world.get({r[0]}, {r[1]}, {r[2]}) === 148 && {G}.world.get({r[0] + 1}, {r[1] + 1}, {r[2]}) === 192', 6)
            print('B builds, A has it', got, await A.evaluate(f'[{G}.world.get({r[0]}, {r[1]}, {r[2]}), {G}.world.get({r[0] + 1}, {r[1] + 1}, {r[2]})]'))
            # 5. the crew member knocks the wall back off: only the wall goes
            await Bp.evaluate(f'{G}.breakBlock({r[0]}, {r[1]}, {r[2]}, 148, "west")')
            back = await wait_for(A, f'{G}.world.get({r[0]}, {r[1]}, {r[2]}) === 144', 6)
            print('B removes the wall, A keeps the floor', back)
            print('errors', errors(la)[-4:], errors(lb)[-4:])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
