import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *

async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p)
            await load(page)
            await page.click('#bStart')
            for i in range(3):
                await page.wait_for_timeout(500)
                print(await page.evaluate('() => { const g = window.__brinebound, P = g.player, c = g.camera; return { yaw: P.yaw, pitch: P.pitch, pos: P.pos.toArray(), cam: c.position.toArray(), rot: [c.rotation.x, c.rotation.y, c.rotation.z], locked: g.input.locked, fb: g.input.fallback, state: g.state } }'))
            print(await page.evaluate('''() => { const g = window.__brinebound, r = g.renderer; let vis = 0, tot = 0; for (const m of g.world.meshes.values()) { tot++; if (m.visible) vis++; } return { vis, tot, tris: r.info.render.triangles, calls: r.info.render.calls, fog: [g.scene.fog.near, g.scene.fog.far], ocean: g.ocean.mesh.position.toArray(), bg: g.scene.background.getHexString(), near: g.camera.near, far: g.camera.far, aspect: g.camera.aspect, fov: g.camera.fov } }'''))
            await shot(page, 'dbg')
            print('\n'.join(logs[-10:]))
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
