import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM

async def ev(page, js):
    return await page.evaluate(js)

TALK = '''(id) => { const g = window.__brinebound, P = g.player, n = g.npcs.get(id);
  if (g.state === 'sheet') g.closeSheet();
  P.mode = 'foot'; P.pos.set(n.site.x + 1.6, n.site.y, n.site.z + 0.2); P.vel.set(0,0,0);
  window.__aimAt(n.site.x, n.site.y + 1.5, n.site.z); window.__sim(0.2);
  g.input.pressed.add('use'); window.__sim(0.05); return g.sheets.name; }'''

async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'low'}))")
            await load(page)
            await page.click('#bStart')
            await page.wait_for_timeout(400)
            await page.click('#sheet button:has-text("Set sail")')
            await page.wait_for_timeout(600)
            await ev(page, SIM)
            # bones -> log
            await ev(page, '() => { const g = window.__brinebound, Q = g.quests; Q.step = 3; Q.phase = 1; Q.flags.lit = true; g.inv.skull = 1; g.inv.page1 = 1; }')
            print('talk', await page.evaluate(TALK, 'tallow'))
            await page.click('#sheet button:has-text("Hand over the captain")')
            await page.wait_for_timeout(300)
            r = await ev(page, '() => { const g = window.__brinebound, Q = g.quests; return { chapter: Q.chapter, bottles: g.props.bottles.map(b => ({ story: !!b.data.story, x: b.x|0, z: b.z|0 })), page3: Q.flags.page3, obj: Q.tracked_().text }; }')
            print('log', json.dumps(r))
            await page.keyboard.press('Escape')
            await page.wait_for_timeout(200)
            # collect the bottle by sailing into it
            r = await ev(page, '''() => { const g = window.__brinebound, P = g.player, s = g.sloop, b = g.props.bottles.find(b => b.data.story);
              s.place(b.x + 2, b.z + 1, 0); g.boardSloop(0, 1.5); window.__sim(0.5);
              return { page2: g.inv.page2, obj: g.quests.tracked_().text }; }''')
            print('bottle', r)
            # dig page three
            r = await ev(page, '''() => { const g = window.__brinebound, P = g.player, w = g.world, f = g.quests.flags.page3;
              P.mode = 'foot'; const top = w.topSolid(f.x, f.z); P.pos.set(f.x + 1.5, top + 1, f.z + 0.5); P.vel.set(0,0,0); g.selectSlot(1);
              let y = top; const dug = []; while (y >= top - 3 && !g.inv.page3) { dug.push(w.get(f.x, y, f.z)); window.__mine(f.x, y, f.z, 5); y--; }
              return { dug, page3: g.inv.page3, obj: g.quests.tracked_().text }; }''')
            print('page3', r)
            print('talk', await page.evaluate(TALK, 'tallow'))
            await page.click('#sheet button:has-text("Give Brother Tallow the log pages")')
            await page.wait_for_timeout(300)
            print('vault chapter', await ev(page, '() => { const g = window.__brinebound, Q = g.quests; return { chapter: Q.chapter, obj: Q.tracked_().text, vault: g.world.sites.vault } }'))
            await page.keyboard.press('Escape')
            await page.wait_for_timeout(200)
            # dig into the vault
            r = await ev(page, '''() => { const g = window.__brinebound, P = g.player, w = g.world, v = w.sites.vault;
              const above = []; for (let y = v.y + 1; y < 40; y++) if (w.get(v.x, y, v.z)) above.push([y, w.get(v.x, y, v.z)]);
              P.mode = 'foot'; P.pos.set(v.x + 0.5, v.y + 1.02, v.z + 1.6); P.vel.set(0,0,0);
              for (let y = v.y + 1; y <= v.y + 3; y++) for (const [dx, dz] of [[0,1],[0,2]]) if (w.solid(v.x + dx, y, v.z + dz)) w.set(v.x + dx, y, v.z + dz, 0);
              g.selectSlot(1);
              const ok = window.__mine(v.x, v.y, v.z, 6);
              return { ok, heart: g.inv.heart, gold: g.gold, phase: g.quests.phase, above: above.length }; }''')
            print('vault', r)
            r = await ev(page, '''() => { const g = window.__brinebound; g.selectSlot(0); window.__fight(30); window.__sim(8); return { hollows: g.hollows.map(h => ({ v: h.variant, hp: h.hp, size: h.size })), obj: g.quests.tracked_().text }; }''')
            print('flagship', r)
            await ev(page, '() => { const g = window.__brinebound, h = g.hollows.find(h => h.variant === "flagship"); const s = g.sloop; s.place(h.pos.x + Math.cos(h.heading) * 26, h.pos.z - Math.sin(h.heading) * 26, h.heading); g.boardSloop(0, 3.75); g.input.pressed.add("use"); g.camMode = "third"; window.__sim(1.5); }')
            await page.wait_for_timeout(600)
            await shot(page, 'v1_flagship')
            r = await ev(page, '''() => { const g = window.__brinebound, P = g.player, s = g.sloop, h = g.hollows.find(h => h.variant === 'flagship');
              window.__sim(120, (g) => { if (h.sinking) return false; const dx = h.pos.x - s.pos.x, dz = h.pos.z - s.pos.z; const rx = Math.cos(s.heading), rz = -Math.sin(s.heading);
                g.input.pressed.add(dx * rx + dz * rz > 0 ? 'star' : 'port'); g.inv.ball = 20; s.hp = Math.max(s.hp, 50); g.player.hp = 100; });
              window.__sim(1);
              return { sunk: h.sinking, hp: h.hp, phase: g.quests.phase, obj: g.quests.tracked_().text }; }''')
            print('flagship fight', r)
            print('talk', await page.evaluate(TALK, 'tallow'))
            await page.click('#sheet button:has-text("I will take it to the deep")')
            await page.wait_for_timeout(300)
            print('deep', await ev(page, '() => { const g = window.__brinebound, Q = g.quests; return { chapter: Q.chapter, obj: Q.tracked_().text } }'))
            errs = [l for l in logs if 'error' in l.lower()]
            print('\n'.join(errs[-10:]) or 'no errors')
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
