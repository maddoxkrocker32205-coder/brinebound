import asyncio, sys, json, time
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from crewlib import *
from simlib import SIM
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
            await Bp.evaluate(SIM); await A.evaluate(SIM)
            # the captain's game puts a merchantman alongside the sloop
            r = await A.evaluate(f'''() => {{ const g = {G}, s = g.sloop; g.boardSloop(0, -3.6);
              const sh = g.fleet.spawn('merchant'); sh.place(s.pos.x + 13, s.pos.z, s.heading); sh.sailLvl = 0; sh.dest = {{ x: sh.pos.x, z: sh.pos.z - 300 }};
              return {{ nid: sh.nid, crew: sh.crew.length }}; }}''')
            print('merchant', r)
            nid = r['nid']
            seen = await wait_for(Bp, f'{G}.crews.puppets.size >= 3', 15)
            print('B sees sailors', seen, await Bp.evaluate(f'{G}.crews.puppets.size'))
            # B swims over and climbs aboard the merchantman
            r = await Bp.evaluate(f'''() => {{ const g = {G}, P = g.player; const sh = g.net.hollowMap.get({nid}); if (!sh) return 'no ship';
              P.mode = 'foot'; P.ship = null; P.boardCD = 0;
              const c = Math.cos(sh.heading), n = Math.sin(sh.heading);
              P.pos.set(sh.pos.x + (-2.7) * c + (-2.6) * n, sh.pos.y - 0.6, sh.pos.z - (-2.7) * n + (-2.6) * c); P.vel.set(0, 0, 0);
              P.yaw = Math.atan2(-(sh.pos.x - P.pos.x), -(sh.pos.z - P.pos.z)); g.input.keys.add('KeyW'); return 'swimming'; }}''')
            print(r)
            aboard = await wait_for(Bp, f'{G}.player.mode === "deck" && {G}.player.ship && {G}.player.ship.remote', 8, 0.1)
            await Bp.evaluate(f'() => {{ {G}.input.keys.clear(); }}')
            print('B aboard the merchantman', aboard)
            onA = await wait_for(A, f'(() => {{ const sh = {G}.hollows.find((h) => h.nid === {nid}); return sh && sh.alertT > 0; }})()', 8)
            print('A: her crew is alerted', onA)
            # B shoots a sailor with the pistol: the captain's game takes the hit
            await asyncio.sleep(1.0)
            r = await Bp.evaluate(f'''() => {{ const g = {G}, P = g.player, I = g.input; g.selectSlot(5); const W = new P.pos.constructor();
              let best = null; for (const s of g.crews.puppets.values()) {{ if (s.state === 'dead' || s.role === 'nest' || !s.av.root.visible) continue; g.crews.worldPos(s, W); const d = Math.hypot(W.x - P.pos.x, W.z - P.pos.z); if (!best || d < best.d) best = {{ s, d, x: W.x, y: W.y, z: W.z }}; }}
              if (!best) return null;
              window.__aimAt(best.x, best.y + 1.1, best.z); g.guns.cd.pistol = 0; I.mouseL = true;
              return {{ nid: best.s.nid, d: +best.d.toFixed(1), shotN: g.guns.shotN }}; }}''')
            print('B fires at', r)
            await asyncio.sleep(0.15)
            await Bp.evaluate(f'() => {{ {G}.input.mouseL = false; }}')
            if r:
                hit = await wait_for(A, f'(() => {{ const s = {G}.crews.byNid({r["nid"]}); return s && s.hp < s.maxHp; }})()', 6)
                print('A: the sailor took the ball', hit)
            shotSeen = await wait_for(A, f'[...{G}.net.mates.values()].some((m) => m.shotN > 0)', 5)
            print('A saw B fire', shotSeen)
            # the captain's game finishes the crew; B opens the strongbox and gets the loot
            await A.evaluate(f'() => {{ const g = {G}, sh = g.hollows.find((h) => h.nid === {nid}); for (const s of sh.crew) g.crews.kill(s); }}')
            taken = await wait_for(Bp, f'(() => {{ const sh = {G}.net.hollowMap.get({nid}); return sh && sh.taken; }})()', 8)
            print('B: she is taken', taken)
            g0 = await Bp.evaluate(f'{G}.gold')
            r = await Bp.evaluate(f'''() => {{ const g = {G}, P = g.player; P.local.set(0.3, -0.7, -1.7); window.__sim && 0; const it = g.computeInteraction(); if (it && it.id === 'strongbox') g.doInteraction(it); return it && it.id; }}''')
            print('B strongbox', r)
            got = await wait_for(Bp, f'{G}.gold > {g0}', 8)
            print('B got loot', got, await Bp.evaluate(f'[{G}.gold, {G}.lootValue({G}.inv)]'))
            # B emotes; A sees the dance
            await Bp.evaluate(f'() => {{ {G}.playEmote("dance"); }}')
            danced = await wait_for(A, f'[...{G}.net.mates.values()].some((m) => m.anim === "dance")', 6)
            print('A sees B dance', danced)
            errs = [l for l in la + lb if 'error' in l.lower() and 'favicon' not in l.lower()]
            print('errors', errs[:6])
            relay.stop(); await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
