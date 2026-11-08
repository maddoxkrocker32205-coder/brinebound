import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=640, h=360)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'low'}))")
            t0 = await page.evaluate('performance.now()')
            await load(page)
            print('load ms', round(await page.evaluate('performance.now()') - t0))
            print('paint ms', await page.evaluate('''() => { const t = performance.now(); window.__brinebound && 0; return 0; }'''))
            r = await page.evaluate('''() => { const g = window.__brinebound, w = g.world; const keys = [];
              for (let k = 0; k < 576; k++) { const cx = (k % 24) * 16 + 8, cz = Math.floor(k / 24) * 16 + 8; if (w.islandAt(cx, cz) >= 0) keys.push(k); }
              const ks = keys.slice(0, 40);
              let t0 = performance.now(); for (const k of ks) w.terrainSurface(k); const tS = (performance.now() - t0) / ks.length;
              t0 = performance.now(); for (const k of ks) w.buildChunk(k); const tB = (performance.now() - t0) / ks.length;
              t0 = performance.now(); for (let i = 0; i < 2000; i++) w.terrainBelow(w.spawn.x + (i % 7), 30, w.spawn.z + (i % 5)); const tQ = (performance.now() - t0) / 2000;
              return { chunks: ks.length, terrainSurface: tS.toFixed(2), buildChunk: tB.toFixed(2), groundQuery_us: (tQ * 1000).toFixed(1) }; }''')
            print(r)
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
