import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from t2_play import SIM

async def ev(page, js):
    return await page.evaluate(js)

AUTOPILOT = '''
window.__autopilot = (tx, tz, sec, stopDist) => {
  const g = window.__brinebound, s = g.sloop, I = g.input; const log = [];
  window.__sim(sec, (g, t) => {
    const dx = tx - s.pos.x, dz = tz - s.pos.z, d = Math.hypot(dx, dz);
    const want = Math.atan2(-dx, -dz);
    let diff = want - s.heading; while (diff > Math.PI) diff -= 2*Math.PI; while (diff < -Math.PI) diff += 2*Math.PI;
    ['KeyA','KeyD','KeyW','KeyS'].forEach(k => I.keys.delete(k));
    window.__stuck = (Math.abs(s.speed) < 0.3 && s.sailLvl > 0.9) ? (window.__stuck || 0) + 1/30 : 0;
    if (window.__unstick > 0) { window.__unstick -= 1/30; I.keys.add('KeyS'); I.keys.add('KeyD'); return; }
    if (window.__stuck > 2) { window.__unstick = 3; window.__stuck = 0; log.push(['unstick', t.toFixed(1)]); }
    if (diff > 0.08) I.keys.add('KeyA'); else if (diff < -0.08) I.keys.add('KeyD');
    if (d > stopDist) I.keys.add('KeyW'); else I.keys.add('KeyS');
    if (Math.abs(t % 5) < 0.034) log.push([t.toFixed(0), s.pos.x.toFixed(1), s.pos.z.toFixed(1), s.speed.toFixed(2), d.toFixed(1), s.hp.toFixed(0)]);
  });
  ['KeyA','KeyD','KeyW','KeyS'].forEach(k => I.keys.delete(k));
  return log;
};
0;
'''

async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p)
            await load(page)
            await page.click('#bStart')
            await page.wait_for_timeout(1000)
            await ev(page, SIM); await ev(page, AUTOPILOT)
            await shot(page, 's1_spawn')
            st = await ev(page, '() => { const P = window.__brinebound.player; return { pos: P.pos.toArray(), mode: P.mode } }')
            print('spawn', st)
            # put the player at the helm directly
            await ev(page, '''() => { const g = window.__brinebound, P = g.player, s = g.sloop; P.mode = 'deck'; P.local.set(0, 1.1, 3.4); P.prevShipHeading = s.heading; P.syncDeckWorld(s); g.input.pressed.add('use'); window.__sim(0.1); }''')
            m = await ev(page, '() => window.__brinebound.map')
            log = await ev(page, f'() => window.__autopilot({m["x"]}, {m["z"]}, 45, 22)')
            print('sail log', log)
            await page.wait_for_timeout(600)
            await shot(page, 's2_arrive')
            # check ship near the island and not stuck
            st = await ev(page, '() => { const g = window.__brinebound, s = g.sloop; return { pos: s.pos.toArray(), hp: s.hp, speed: s.speed, d: Math.hypot(g.map.x - s.pos.x, g.map.z - s.pos.z) } }')
            print('arrive', st)
            # Spawn the hollow near the sloop on its starboard side and fight with broadsides
            fight = await ev(page, '''() => {
              const g = window.__brinebound, s = g.sloop, I = g.input;
              g.gold = 100;
              // move the sloop into open water first
              s.place(150, 110, -Math.PI/2);
              g.player.mode = 'helm';
              g.spawnHollow();
              const h = g.hollow;
              const rx = Math.cos(s.heading), rz = -Math.sin(s.heading);
              h.place(s.pos.x + rx * 26, s.pos.z + rz * 26, s.heading + 0.3);
              const log = []; let shots = 0, hits0 = h.hp, my0 = s.hp;
              window.__sim(40, (g, t) => {
                if (!g.hollow || g.hollow.sinking) return;
                const hh = g.hollow;
                const dx = hh.pos.x - s.pos.x, dz = hh.pos.z - s.pos.z, d = Math.hypot(dx, dz);
                const sr = Math.cos(s.heading), sz = -Math.sin(s.heading);
                const c = (dx * sr + dz * sz) / d;
                if (c > 0.78) { I.pressed.add('e'); } else if (c < -0.78) { I.pressed.add('q'); }
                // keep the enemy abeam: steer so it's at 90 deg
                ['KeyA','KeyD','KeyW','KeyS'].forEach(k => I.keys.delete(k));
                I.keys.add(d > 30 ? 'KeyW' : 'KeyS');
                if (g.inv.ball < 4) g.inv.ball = 20;
                if (Math.abs(t % 4) < 0.034) log.push([t.toFixed(0), d.toFixed(1), hh.hp.toFixed(0), s.hp.toFixed(0), g.projectiles.list.length]);
              });
              ['KeyA','KeyD','KeyW','KeyS'].forEach(k => I.keys.delete(k));
              return { log, hollowHp: g.hollow ? g.hollow.hp : 'gone', sinking: g.hollow ? g.hollow.sinking : null, my: s.hp, loot: g.props.loot.length, gold: g.gold };
            }''')
            print('fight', json.dumps(fight))
            await page.wait_for_timeout(500)
            await shot(page, 's3_battle')
            # collect loot by sailing to it
            if fight['loot']:
                lt = await ev(page, '''() => { const g = window.__brinebound, L = g.props.loot[0]; return [L.x, L.z]; }''')
                lg = await ev(page, f'() => window.__autopilot({lt[0]}, {lt[1]}, 25, 0)')
                print('loot run', lg[-3:], await ev(page, '() => ({ gold: window.__brinebound.gold, loot: window.__brinebound.props.loot.length })'))
            # night on an island with skeletons
            night = await ev(page, '''() => {
              const g = window.__brinebound, P = g.player, w = g.world;
              g.time = 290; P.mode = 'foot'; P.boardCD = 5;
              const o = w.islands[2];
              const x = Math.floor(o.x), z = Math.floor(o.z);
              P.pos.set(x + 0.5, w.standY(x, z) + 0.001, z + 0.5); P.vel.set(0,0,0);
              window.__sim(14);
              return { sk: g.enemies.list.length, night: g.sky.isNight, hp: P.hp, alive: P.alive };
            }''')
            print('night', night)
            await ev(page, '''() => { const g = window.__brinebound, s = g.enemies.list[0]; if (s) window.__aimAt(s.pos.x, s.pos.y + 1.4, s.pos.z); }''')
            await page.wait_for_timeout(700)
            await shot(page, 's4_night')
            # dawn burns skeletons
            dawn = await ev(page, '''() => { const g = window.__brinebound; g.time = 365; window.__sim(4); return { sk: g.enemies.list.length, night: g.sky.isNight } }''')
            print('dawn', dawn)
            # bank gold at Mags
            bank = await ev(page, '''() => {
              const g = window.__brinebound, P = g.player, m = g.props.mags;
              g.gold = 150; P.mode = 'foot';
              P.pos.set(m.x, m.y + 0.001, m.z + 2.9); P.vel.set(0,0,0); P.yaw = 0; P.pitch = -0.1;
              window.__sim(0.2);
              const it = g.interaction;
              g.input.pressed.add('use'); window.__sim(0.2);
              return { it, banked: g.banked, gold: g.gold, level: g.level, map: g.map };
            }''')
            print('bank', bank)
            await page.wait_for_timeout(600)
            await shot(page, 's5_bank')
            # death and respawn
            dead = await ev(page, '''() => { const g = window.__brinebound, P = g.player; g.gold = 40; P.hurt(500, null); const a = P.alive; window.__sim(3.5); return { aliveAfterHit: a, alive: P.alive, mode: P.mode, gold: g.gold, hp: P.hp }; }''')
            print('death', dead)
            errs = [l for l in logs if 'error' in l.lower() or 'warn' in l.lower()]
            print('\n'.join(errs[-20:]))
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
