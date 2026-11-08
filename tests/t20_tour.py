import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM

STOPS = sys.argv[1].split(',') if len(sys.argv) > 1 else ['volcano', 'jungle', 'atoll', 'wreck', 'ruin', 'map']

async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'medium', view: 'far'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            await page.evaluate('() => { const g = window.__brinebound; g.ui.toastsEl.style.display = "none"; g.camMode = "third"; for (let i = 0; i < g.world.islands.length; i++) if (!g.quests.discovered.includes(i)) g.quests.discovered.push(i); g.ui.mapBase = null; }')
            for stop in STOPS:
                if stop == 'map':
                    await page.keyboard.press('KeyM'); await page.wait_for_timeout(1200)
                    await shot(page, 'w_map'); await page.keyboard.press('KeyM'); continue
                r = await page.evaluate('''(stop) => {
                  const g = window.__brinebound, w = g.world, P = g.player;
                  let tx, tz, look;
                  const isl = (type) => w.islands.find(o => o.type === type);
                  if (stop === 'volcano') { const o = isl('volcano'); tx = o.x + o.r * 1.15; tz = o.z + o.r * 0.6; look = [o.x, w.sites.volcano.y + 2, o.z]; }
                  if (stop === 'jungle') { const o = isl('jungle'); tx = o.x + 4; tz = o.z + 4; look = [o.x - 6, 0, o.z - 6]; }
                  if (stop === 'atoll') { const o = isl('atoll'); tx = o.x + o.r * 0.78; tz = o.z; look = [o.x - 4, 11, o.z]; }
                  if (stop === 'wreck') { const wr = w.sites.wrecks.find(q => q.y > 8) || w.sites.wrecks[0]; tx = wr.x + 9; tz = wr.z + 5; look = [wr.x, 11, wr.z]; }
                  if (stop === 'ruin') { const l = w.sites.loot.find(q => q.kind === 'ruin'); tx = l.x + 6; tz = l.z + 6; look = [l.x, l.y + 1, l.z]; }
                  P.mode = 'foot';
                  let y = w.standY(Math.floor(tx), Math.floor(tz));
                  P.pos.set(tx, Math.max(y, 12) + 0.01, tz); P.vel.set(0, 0, 0);
                  g.world.buildNear(tx, tz, 110);
                  const ly = look[1] || P.pos.y + 1;
                  window.__aimAt(look[0], ly, look[2]);
                  g.time = 360 * 2 + 120;
                  window.__sim(0.3);
                  return { stop, x: tx | 0, z: tz | 0, y: P.pos.y | 0 };
                }''', stop)
                print(r)
                await page.wait_for_timeout(900)
                await shot(page, f'w_{stop}')
            errs = [l for l in logs if 'error' in l.lower()]
            print('\n'.join(errs[-10:]) or 'no errors')
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
