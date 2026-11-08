import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
G = 'window.__brinebound'
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=1100, h=620)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'medium'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(1500)
            r = await page.evaluate(f'''() => {{ const g = {G}, R = g.renderer, S = g.scene, C = g.camera;
              const time = (n = 6) => {{ R.render(S, C); const t = performance.now(); for (let i = 0; i < n; i++) R.render(S, C); R.getContext().finish(); return ((performance.now() - t) / n).toFixed(0); }};
              const out = {{ base: time() }};
              g.physics.flash.visible = false; out.noFlash = time(); g.physics.flash.visible = true;
              g.sky.clouds.visible = false; out.noClouds = time(); g.sky.clouds.visible = true;
              const tex = g.tex; const a = tex.anisotropy; tex.anisotropy = 1; tex.needsUpdate = true; out.aniso1 = time(); tex.anisotropy = a; tex.needsUpdate = true;
              let tris = 0; S.traverse(o => {{ if (o.isMesh && o.visible && o.geometry) {{ const gg = o.geometry; tris += (gg.index ? gg.index.count : gg.attributes.position.count) / 3; }} }});
              out.tris = Math.round(tris); out.calls = R.info.render.calls;
              return out; }}''')
            print('title render ms', r)
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
