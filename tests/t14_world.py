import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM

Q = sys.argv[1] if len(sys.argv) > 1 else 'medium'
ONLY = sys.argv[2] if len(sys.argv) > 2 else 'all'

async def ev(page, js):
    return await page.evaluate(js)

async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p)
            await page.add_init_script(f"localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({{quality: '{Q}'}}))")
            await load(page)
            await page.click('#bStart')
            await page.wait_for_timeout(500)
            await page.click('#sheet button:has-text("Set sail")')
            await page.wait_for_timeout(500)
            await ev(page, SIM)
            await ev(page, '() => { const g = window.__brinebound; g.ui.toastsEl.style.display = "none"; }')
            if ONLY in ('all', 'hands'):
                # first-person hands with several items, looking at open ground
                for slot, name in [(0, 'cutlass'), (1, 'pick'), (2, 'plank'), (6, 'lantern'), (7, 'coconut')]:
                    await ev(page, f'() => {{ const g = window.__brinebound; g.selectSlot({slot}); g.player.pitch = -0.25; window.__sim(0.1); }}')
                    await page.wait_for_timeout(350)
                    await shot(page, f'h_{name}')
                await ev(page, '() => { const g = window.__brinebound; g.selectSlot(0); g.vmSwing = 0.55; }')
                await page.wait_for_timeout(50)
                await shot(page, 'h_swing')
            if ONLY in ('all', 'night'):
                r = await ev(page, '''() => {
                  const g = window.__brinebound, P = g.player, w = g.world;
                  // an open grassy spot on Saltbone or another forest island, far from lamps
                  let spot = null;
                  for (const o of w.islands) { if (o.type !== 'forest' && o.type !== 'palm') continue; if (o.name === 'Lantern Cay' || o.name === 'Brine Haven') continue;
                    for (let a = 0; a < 6.28 && !spot; a += 0.3) { const x = Math.floor(o.x + Math.cos(a) * o.r * 0.4), z = Math.floor(o.z + Math.sin(a) * o.r * 0.4); const t = w.topSolid(x, z); if (t >= 12 && !w.solid(x, t + 1, z) && !w.solid(x, t + 2, z) && !g.lampNear(x, t + 1, z, 12)) spot = { x, y: t + 1, z, o: o.name }; }
                    if (spot) break; }
                  P.mode = 'foot'; P.pos.set(spot.x + 0.5, spot.y, spot.z + 0.5); P.vel.set(0, 0, 0);
                  g.time = 360 * 2 + 262; g.camMode = 'third'; g.selectSlot(0);
                  g.enemies.spawnT = 0;
                  window.__sim(14, (g) => { g.player.hp = 100; });
                  return { spot, isNight: g.sky.isNight, nearLight: g.nearLight(), enemies: g.enemies.list.map(s => ({ k: s.kind, st: s.state, d: +Math.hypot(s.pos.x - P.pos.x, s.pos.z - P.pos.z).toFixed(1) })) };
                }''')
                print('night', json.dumps(r))
                await ev(page, '''() => { const g = window.__brinebound, P = g.player; const s = g.enemies.list[0]; if (s) { P.yaw = Math.atan2(-(s.pos.x - P.pos.x), -(s.pos.z - P.pos.z)) + 0.35; P.pitch = -0.12; } window.__sim(0.05); }''')
                await page.wait_for_timeout(500)
                await shot(page, 'n1_night_third')
                # place a lantern next to us and see night walkers burn
                r = await ev(page, '''() => {
                  const g = window.__brinebound, P = g.player, w = g.world;
                  const x = Math.floor(P.pos.x) + 1, z = Math.floor(P.pos.z), y = Math.floor(P.pos.y);
                  w.set(x, y, z, 18);
                  const n0 = g.enemies.list.filter(s => s.kind === 'night').length;
                  // walk skeletons into the light
                  for (const s of g.enemies.list) { s.pos.set(x + 2.5, y, z + 0.5); }
                  window.__sim(3, (g) => { g.player.hp = 100; });
                  return { n0, after: g.enemies.list.filter(s => s.kind === 'night' && s.state !== 'dying').length, lamps: w.lamps.size, nearLight: g.nearLight() };
                }''')
                print('lantern', r)
                await page.wait_for_timeout(400)
                await shot(page, 'n2_lantern')
                await ev(page, '() => { const g = window.__brinebound; g.camMode = "first"; window.__sim(0.05); }')
                await page.wait_for_timeout(400)
                await shot(page, 'n3_lantern_first')
            if ONLY in ('all', 'light'):
                # deliver the oil: jump the story to the oil chapter, phase 1 with oil in the bag
                r = await ev(page, '''() => {
                  const g = window.__brinebound, Q = g.quests, P = g.player, t = g.npcs.get('tallow');
                  Q.step = 2; Q.phase = 1; g.inv.oil = 1;
                  P.mode = 'foot'; P.pos.set(t.site.x + 1.8, t.site.y, t.site.z); P.vel.set(0, 0, 0);
                  window.__aimAt(t.site.x, t.site.y + 1.5, t.site.z);
                  window.__sim(0.2);
                  g.input.pressed.add('use'); window.__sim(0.05);
                  return { sheet: g.sheets.name, it: g.interaction && g.interaction.label };
                }''')
                print('tallow', r)
                await page.wait_for_timeout(500)
                await shot(page, 'l1_tallow')
                await page.click('#sheet button:has-text("Hand over the lamp oil")')
                await page.wait_for_timeout(300)
                print('lit', await ev(page, '() => { const g = window.__brinebound; return { lit: g.quests.flags.lit, chapter: g.quests.chapter, banked: g.banked, offers: g.quests.offers.tallow.map(o => o.title) } }'))
                await shot(page, 'l2_tallow_after')
                await page.keyboard.press('Escape')
                await page.wait_for_timeout(200)
                await ev(page, '''() => { const g = window.__brinebound, P = g.player, lh = g.world.sites.lighthouse;
                  g.time = 360 * 3 + 270; g.camMode = 'third';
                  P.pos.set(lh.x + 22, P.pos.y, lh.z + 22); P.pos.y = g.world.standY(Math.floor(P.pos.x), Math.floor(P.pos.z)) + 0.01;
                  window.__aimAt(lh.x, lh.y, lh.z); g.player.pitch = 0.15; window.__sim(1.2); }''')
                await page.wait_for_timeout(600)
                await shot(page, 'l3_lighthouse_night')
            if ONLY in ('all', 'camp'):
                r = await ev(page, '''() => {
                  const g = window.__brinebound, Q = g.quests, P = g.player, c = Q.camps.story;
                  Q.step = 3; Q.phase = 0; c.active = true; g.time = 360 * 4 + 40; g.camMode = 'third';
                  P.mode = 'foot'; P.pos.set(c.x + 9, c.y + 0.01, c.z); P.vel.set(0, 0, 0);
                  P.pos.y = g.world.standY(Math.floor(P.pos.x), Math.floor(P.pos.z)) + 0.01;
                  window.__aimAt(c.x, c.y + 1, c.z);
                  window.__sim(2.5, (g) => { g.player.hp = 100; });
                  return { spawned: g.enemies.list.filter(s => s.campId === 'story').map(s => s.kind), obj: Q.tracked_().text };
                }''')
                print('camp', r)
                await page.wait_for_timeout(500)
                await shot(page, 'c1_camp')
                r = await ev(page, '''() => { const g = window.__brinebound; g.selectSlot(0); window.__fight(60); const Q = g.quests; return { left: g.enemies.list.length, phase: Q.phase, skull: g.inv.skull, page1: g.inv.page1, cleared: Q.camps.story.cleared, obj: Q.tracked_().text, kills: g.stats.kills }; }''')
                print('camp fight', r)
                r = await ev(page, '''() => { const g = window.__brinebound, P = g.player; return { p: [P.pos.x.toFixed(1), P.pos.y.toFixed(1), P.pos.z.toFixed(1)], hp: P.hp, list: g.enemies.list.map(s => [s.kind, s.state, s.campId, Math.hypot(s.pos.x - P.pos.x, s.pos.z - P.pos.z).toFixed(1), (s.pos.y - P.pos.y).toFixed(1), s.hp]), kegs: g.physics.kegs.size, fallers: g.physics.fallers.length }; }''')
                print('after fight', r)
            if ONLY in ('all', 'storm'):
                r = await ev(page, '''() => {
                  const g = window.__brinebound, P = g.player, s = g.sloop, d = g.world.dock;
                  g.time = 360 * 5 + 120; g.camMode = 'first';
                  s.place(d.x + 30, d.z + 6, -Math.PI / 2);
                  g.boardSloop(0, 3.75); g.input.pressed.add('use'); window.__sim(0.05);
                  g.weather.force(40); g.weather.storm = 0.95;
                  s.sailLvl = 1;
                  window.__sim(3);
                  return { storm: g.weather.storm, amp: +window.__brinebound.weather.storm.toFixed(2), mode: P.mode, speed: +s.speed.toFixed(2) };
                }''')
                print('storm', r)
                await page.wait_for_timeout(600)
                await shot(page, 's1_storm')
                await ev(page, '() => { const g = window.__brinebound; g.weather.forced = 0; g.weather.storm = 0; g.weather.state = "clear"; g.weather.timer = 500; window.__sim(0.1); }')
            if ONLY in ('all', 'kraken'):
                r = await ev(page, '''() => {
                  const g = window.__brinebound, Q = g.quests, P = g.player, s = g.sloop;
                  Q.step = 6; Q.phase = 0;
                  const spot = Q.deepSpot();
                  g.time = 360 * 6 + 262;
                  s.place(spot.x, spot.z, 0); s.hp = s.maxHp;
                  if (P.mode !== 'helm') { g.boardSloop(0, 3.75); g.input.pressed.add('use'); window.__sim(0.05); }
                  window.__sim(1);
                  return { kraken: !!g.kraken, phase: Q.phase, night: g.sky.isNight, spot };
                }''')
                print('kraken start', r)
                await ev(page, '() => window.__sim(4, (g) => { g.sloop.hp = Math.max(g.sloop.hp, 60); })')
                await page.wait_for_timeout(800)
                await shot(page, 'k1_kraken')
                r = await ev(page, '''() => {
                  const g = window.__brinebound, s = g.sloop;
                  let n = 0;
                  window.__sim(260, (g, t) => {
                    if (!g.kraken) return false;
                    s.hp = Math.max(s.hp, 60); g.inv.ball = 20; g.player.hp = 100;
                    const k = g.kraken;
                    const tl = k.aimTarget(s, 1), tr = k.aimTarget(s, -1);
                    if (tl) g.input.pressed.add('star'); else if (tr) g.input.pressed.add('port');
                    else s.rudder = 1;
                    n++;
                  });
                  return { kraken: !!g.kraken, chapter: g.quests.chapter, pearl: g.inv.pearl, gold: g.gold };
                }''')
                print('kraken fight', r)
                await page.wait_for_timeout(500)
                await shot(page, 'k2_after')
            errs = [l for l in logs if 'error' in l.lower()]
            print('\n'.join(errs[-20:]) or 'no errors')
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
