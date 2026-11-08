import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from t2_play import SIM
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p)
            await load(page)
            await page.click('#bStart')
            await page.wait_for_timeout(1200)
            await page.evaluate(SIM)
            await shot(page, 'z1_spawn')
            # battle scene with combat camera
            await page.evaluate('''() => { const g = window.__brinebound, s = g.sloop, P = g.player;
              s.place(170, 105, -Math.PI/2 + 0.4); P.mode = 'helm'; g.helmYaw = 0; g.helmPitch = 0.3; g.camPos.set(170, 20, 125);
              g.gold = 120; g.spawnHollow(); const h = g.hollow; const rx = Math.cos(s.heading), rz = -Math.sin(s.heading);
              h.place(s.pos.x + rx * 24 + 6, s.pos.z + rz * 24, s.heading + 0.2);
              g.time = 205; g.camIdle = 5;
              window.__sim(3, (g) => { g.input.pressed.add('e'); });
            }''')
            await page.wait_for_timeout(1500)
            await shot(page, 'z2_battle')
            # night on Gullwreck with skeletons
            await page.evaluate('''() => { const g = window.__brinebound, P = g.player, w = g.world;
              g.removeHollow(); g.projectiles.clear(); g.time = 285; P.mode = 'foot'; P.boardCD = 5;
              const o = w.islands[1]; const x = Math.floor(o.x) + 3, z = Math.floor(o.z) + 2;
              P.pos.set(x + 0.5, w.standY(x, z) + 0.001, z + 0.5); P.vel.set(0,0,0);
              g.enemies.spawnNear(P.pos.x, P.pos.z, 3, 5, 8, false);
              window.__sim(1.6);
              const s = g.enemies.list[0]; if (s) window.__aimAt(s.pos.x, s.pos.y + 1.3, s.pos.z);
            }''')
            await page.wait_for_timeout(1200)
            await shot(page, 'z3_night')
            print('errors', [l for l in logs if 'error' in l.lower()][-5:])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
