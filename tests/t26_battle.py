import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM
URL = sys.argv[1] if len(sys.argv) > 1 else 'brinebound.html'
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=640, h=360)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'low'}))")
            await page.goto('http://127.0.0.1:8765/' + URL)
            await page.wait_for_function('window.__brinebound && window.__brinebound.state === "title"', timeout=90000)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            res = []
            for trial in range(4):
                r = await page.evaluate('''() => {
                  const g = window.__brinebound, P = g.player, s = g.sloop;
                  for (const h of g.hollows) h.dispose(); g.hollows = [];
                  s.place(200, 300, 0); P.mode = 'foot'; P.pos.set(200, 14, 300);
                  const h = g.spawnHollow({}); if (!h) return 'no hollow';
                  g.boardSloop(0, 3.75); g.input.pressed.add('use'); window.__sim(0.05);
                  s.place(h.pos.x + Math.cos(h.heading) * 22, h.pos.z - Math.sin(h.heading) * 22, h.heading);
                  let shots = 0, hp0 = h.hp, t1 = 0;
                  window.__sim(60, (g, t) => {
                    if (h.sinking) { if (!t1) t1 = t; return false; }
                    const dx = h.pos.x - s.pos.x, dz = h.pos.z - s.pos.z;
                    const rx = Math.cos(s.heading), rz = -Math.sin(s.heading);
                    const side = dx * rx + dz * rz > 0 ? 1 : -1;
                    g.input.pressed.add(side > 0 ? 'star' : 'port'); shots++;
                    g.inv.ball = Math.max(g.inv.ball, 6); s.hp = Math.max(s.hp, 40);
                  });
                  return [h.sinking, Math.round(h.hp), hp0, Math.round(t1)];
                }''')
                res.append(r)
            print(URL, res)
            print([l for l in logs if 'error' in l.lower()][-3:])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
