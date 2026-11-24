import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *


async def main():
    srv = serve()
    await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=960, h=540)
            await page.add_init_script("localStorage.clear();")
            await page.goto('http://127.0.0.1:8765/brinebound-offline.html')
            await page.wait_for_function('window.__brinebound && window.__brinebound.state === "title"', timeout=120000)
            result = await page.evaluate('''async () => {
              const g = window.__brinebound, cam = g.camera;
              const oldPos = cam.position.clone(), oldRot = cam.rotation.clone();
              cam.position.set(0, 0, 0); cam.rotation.set(0, 0, 0);
              const right = g.panToListener(10, 0), left = g.panToListener(-10, 0);
              const center = g.panToListener(0, -10), same = g.panToListener(0, 0);
              cam.rotation.set(0, Math.PI / 2, 0);
              const turned = g.panToListener(0, -10);
              cam.position.copy(oldPos); cam.rotation.copy(oldRot);

              const Sfx = g.sfx.constructor;
              async function render(pan, distance, fallback, gun) {
                const ctx = new OfflineAudioContext(2, 44100 * 2, 44100), s = new Sfx();
                s.ctx = ctx; s.master = ctx.createGain(); s.master.connect(ctx.destination);
                s.noise = ctx.createBuffer(1, 44100 * 2, 44100);
                const noise = s.noise.getChannelData(0);
                for (let i = 0; i < noise.length; i++) noise[i] = Math.sin(i * 0.71);
                if (fallback) ctx.createStereoPanner = undefined;
                if (gun) s.gun('musket', distance, pan); else s.boom(distance, pan);
                const buf = await ctx.startRendering();
                return [0, 1].map((c) => {
                  const data = buf.getChannelData(c);
                  return Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
                });
              }
              const audio = {
                left: await render(-1, 10, false, false),
                right: await render(1, 10, false, false),
                gun: await render(1, 10, false, true),
                far: await render(1, 100, false, false),
                fallback: await render(1, 10, true, false),
              };

              const oldQuality = g.settings.get('quality'), oldState = g.state;
              g.state = 'play'; g.settings.v.quality = 'auto'; g.autoQ = 'high';
              g.resScale = 1; g.perfT = g.perfFrames = g.slowT = g.fastT = 0; g.applySettings();
              const base = g.renderer.getPixelRatio();
              for (let i = 0; i < 65; i++) g.perf(0.1);
              const slow = [g.resScale, g.renderer.getPixelRatio(), g.autoQ];
              for (let i = 0; i < 1000; i++) g.perf(1 / 60);
              const fast = [g.resScale, g.renderer.getPixelRatio()];
              g.perf(2);
              const paused = [g.perfT, g.slowT, g.fastT];
              for (let i = 0; i < 330; i++) g.perf(0.1);
              const floor = [g.resScale, g.autoQ];
              g.settings.v.quality = 'low'; g.applySettings();
              for (let i = 0; i < 100; i++) g.perf(0.1);
              const manual = [g.resScale, g.qualityName()];
              g.settings.v.quality = oldQuality; g.state = oldState; g.applySettings();
              return {right, left, center, same, turned, audio, base, slow, fast, paused, floor, manual};
            }''')
            assert result['right'] > 0.99 and result['left'] < -0.99
            assert abs(result['center']) < 0.001 and result['same'] == 0
            assert result['turned'] > 0.99
            a = result['audio']
            assert a['left'][0] > a['left'][1] * 10
            assert a['right'][1] > a['right'][0] * 10
            assert a['gun'][1] > a['gun'][0] * 10
            assert a['far'][1] < a['right'][1]
            assert abs(a['fallback'][0] - a['fallback'][1]) < 0.00001
            assert result['slow'][0] == 0.9 and result['slow'][1] < result['base'] and result['slow'][2] == 'high'
            assert result['fast'][0] == 1 and abs(result['fast'][1] - result['base']) < 0.001
            assert result['paused'] == [0, 0, 0]
            assert result['floor'] == [0.65, 'medium']
            assert result['manual'] == [1, 'low']
            errors = [line for line in logs if line.startswith('[error]') or line.startswith('[pageerror]')]
            assert not errors, errors
            print('Phase 3 audio and adaptive resolution:', result)
            await b.close()

            b, page, logs = await setup(p, mobile=True, w=393, h=660)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'low'}))")
            await page.goto('http://127.0.0.1:8765/brinebound-offline.html')
            await page.wait_for_function('window.__brinebound && window.__brinebound.state === "title"', timeout=120000)
            await page.tap('#bStart')
            await page.tap('#sheet button:has-text("Set sail")')
            await page.wait_for_function('window.__brinebound.state === "play"', timeout=60000)
            live = await page.evaluate('''() => {
              const g = window.__brinebound;
              g.sfx.boom(10, -1); g.sfx.gun('musket', 10, 1);
              return { state: g.sfx.ctx && g.sfx.ctx.state, quality: g.qualityName() };
            }''')
            assert live == {'state': 'running', 'quality': 'low'}, live
            await page.set_viewport_size({'width': 852, 'height': 340})
            await page.wait_for_timeout(1000)
            errors = [line for line in logs if line.startswith('[error]') or line.startswith('[pageerror]')]
            assert not errors, errors
            print('Mobile live audio and rotation:', live)
            await b.close()
    finally:
        srv.terminate()


asyncio.run(main())
