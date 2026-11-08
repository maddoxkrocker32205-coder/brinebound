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
            await page.evaluate('''() => { const P = window.__brinebound.player; let y = P.yaw; window.__trap = [];
              Object.defineProperty(P, 'yaw', { get() { return y; }, set(v) { if (Number.isNaN(v) && window.__trap.length < 3) window.__trap.push(new Error('yaw NaN').stack); y = v; } }); }''')
            await page.click('#bStart')
            await page.wait_for_timeout(800)
            await page.evaluate(SIM)
            r = await page.evaluate('''() => { const g = window.__brinebound, P = g.player, I = g.input, w = g.world;
              const out = { start: P.pos.toArray(), collides: P.collides(), onGround: P.onGround, vel0: P.vel.toArray(), yaw: P.yaw, wave: g.waveTime, dtl: g.last };
              const trace = [];
              for (let i = 0; i < 3; i++) { const dt = 1/30; g.waveTime += dt; const wy = 11.88; P.updateFoot(dt, I); trace.push([P.vel.toArray(), P.pos.toArray(), P.onGround, P.inWater]); }
              out.trace = trace;
              const around = [];
              for (let dy = -1; dy <= 2; dy++) { let row = []; for (let dz = -2; dz <= 2; dz++) { let s = ''; for (let dx = -2; dx <= 2; dx++) s += w.get(Math.floor(P.pos.x) + dx, Math.floor(P.pos.y) + dy, Math.floor(P.pos.z) + dz); row.push(s); } around.push(dy + ': ' + row.join(' ')); }
              out.around = around;
              I.keys.add('KeyW'); window.__sim(2); I.keys.delete('KeyW');
              out.afterW = P.pos.toArray(); out.vel = P.vel.toArray(); out.move = [I.move.x, I.move.y];
              return out; }''')
            print(json.dumps(r['yaw']))
            print('\n'.join(await page.evaluate('() => window.__trap')))
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
