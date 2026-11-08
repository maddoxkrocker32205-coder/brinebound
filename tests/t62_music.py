import asyncio, sys, json, math
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
G = 'window.__brinebound'
MUSIC = open(f'{ROOT}/src/music.js', 'rb').read()  # music.js imports nothing, so the page can load it as it is
RENDER = '''async () => {
  const { Music, TRACKS } = await import('/_music.mjs');
  const out = {};
  for (const id of Object.keys(TRACKS)) {
    const buf = await Music.render(id, 16, 22050);
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, k = 0.48;  // in game: the master gain is 0.6 x volume 0.8
    let peak = 0, sum = 0, loud = 0;
    const win = 22050 * 0.4; let ws = 0, wc = 0;
    for (let i = 0; i < n; i++) { const v = Math.max(Math.abs(L[i]), Math.abs(R[i])) * k; if (v > peak) peak = v; const e = (L[i] * L[i] + R[i] * R[i]) * 0.5 * k * k; sum += e; ws += e; if (++wc >= win) { loud = Math.max(loud, ws / wc); ws = 0; wc = 0; } }
    const db = (e) => (10 * Math.log10(e + 1e-12)).toFixed(1);
    out[id] = { secs: (n / 22050).toFixed(1), peak: peak.toFixed(3), rmsDb: db(sum / n), loudest400msDb: db(loud), nan: L.some((v) => !Number.isFinite(v)) };
  }
  return out;
}'''
async def level(page, secs=2.0):
    return await page.evaluate('''async (secs) => {
      const s = window.__brinebound.sfx, a = s.__an || (s.__an = (() => { const n = s.ctx.createAnalyser(); n.fftSize = 2048; s.music.bus.connect(n); return n; })());
      const d = new Float32Array(a.fftSize); let e = 0, c = 0, pk = 0;
      const end = performance.now() + secs * 1000;
      while (performance.now() < end) { a.getFloatTimeDomainData(d); for (const v of d) { e += v * v; pk = Math.max(pk, Math.abs(v)); } c += d.length; await new Promise((r) => setTimeout(r, 45)); }
      return { musicRmsDb: +(10 * Math.log10(e / c + 1e-12)).toFixed(1), peak: +pk.toFixed(3) };
    }''', secs)
async def music_state(page):
    return await page.evaluate(f'() => {{ const s = {G}.sfx, m = s.music; return {{ ctx: s.ctx && s.ctx.state, mood: s.mood, playing: m && m.curId, bar: m && m.cur && m.cur.bar, of: m && m.cur && m.cur.bars.length, on: m && m.on }}; }}')
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=960, h=540)
            await page.route('http://127.0.0.1:8765/_music.mjs', lambda r: r.fulfill(status=200, body=MUSIC, headers={'Content-Type': 'text/javascript'}))
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'low'}))")
            await load(page)
            print('offline renders (16 bars, after the master gain):')
            for k, v in (await page.evaluate(RENDER)).items(): print(' ', k, v)
            # in game: the title tune starts on the first tap
            await page.mouse.click(5, 5); await page.wait_for_timeout(2500)
            print('title:', await music_state(page), await level(page))
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")')
            await page.wait_for_function(f'{G}.state === "play"', timeout=30000)
            await page.evaluate(f'() => {{ {G}.sky.isNight = false; }}')
            await page.wait_for_timeout(5000)
            print('ashore:', await music_state(page), await level(page))
            # sailing: put the captain at the helm and get under way
            await page.evaluate(f'''() => {{ const g = {G}, s = g.sloop; g.player.mode = 'helm'; g.player.ship = s; s.speed = 6; g.sailT = 12; }}''')
            await page.wait_for_timeout(4000)
            print('sailing:', await music_state(page))
            # a hollowman close by: battle
            await page.evaluate(f'''() => {{ const g = {G}, P = g.player; g.player.mode = 'foot'; g.player.ship = null; g.fightT = 0; g.enemies.list.push({{ state: 'walk', pos: {{ x: P.pos.x + 4, y: P.pos.y, z: P.pos.z }}, dispose() {{}}, update() {{}}, remoteUpdate() {{}}, fake: true }}); }}''')
            await page.wait_for_timeout(3500)
            print('fight:', await music_state(page), await level(page))
            await page.evaluate(f'() => {{ const g = {G}; g.enemies.list = g.enemies.list.filter((e) => !e.fake); g.fightT = 0.5; }}')
            await page.wait_for_timeout(4000)
            print('after the fight:', await music_state(page))
            print('  why:', await page.evaluate(f'''() => {{ const g = {G}, P = g.player, px = P.pos.x, pz = P.pos.z, d = (x, z) => Math.round(Math.hypot(x - px, z - pz));
              return {{ fightT: g.fightT, kraken: !!(g.kraken && g.kraken.alive), pship: !!P.ship, alert: P.ship && P.ship.alertT, ships: g.hollows.filter((h) => !h.sinking && g.fleet.hostile(h)).map((h) => [h.kind, d(h.pos.x, h.pos.z)]), mobs: g.enemies.list.filter((e) => e.state !== 'dying').map((e) => [e.state, d(e.pos.x, e.pos.z), !!e.fake]) }}; }}'''))
            # music off in settings
            await page.evaluate(f'() => {{ {G}.sfx.setMusic(false); }}')
            await page.wait_for_timeout(3500)
            print('music off:', await music_state(page), await level(page, 1.0))
            await page.evaluate(f'() => {{ {G}.sfx.setMusic(true); }}')
            await page.wait_for_timeout(2500)
            print('music on again:', await music_state(page))
            await page.evaluate(f'() => {{ {G}.quitToTitle(); }}')
            await page.wait_for_timeout(5000)
            print('back at title:', await music_state(page))
            errs = [l for l in logs if 'error' in l.lower() or 'hiccup' in l.lower() or 'bar ' in l.lower()]
            print('errors:', errs[:6])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
