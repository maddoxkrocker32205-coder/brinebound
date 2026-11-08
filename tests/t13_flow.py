import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM

Q = sys.argv[1] if len(sys.argv) > 1 else 'medium'

async def ev(page, js):
    return await page.evaluate(js)

async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p)
            await page.add_init_script(f"if (!sessionStorage.getItem('init')) {{ sessionStorage.setItem('init', '1'); localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({{quality: '{Q}'}})); }}")
            await load(page)
            await page.click('#bStart')
            await page.wait_for_timeout(600)
            await page.click('#sheet button:has-text("Set sail")')
            await page.wait_for_timeout(600)
            await ev(page, SIM)
            # 1. chop three logs
            r = await ev(page, '''() => {
              const g = window.__brinebound, w = g.world, P = g.player;
              let best = null;
              for (let x = Math.floor(P.pos.x) - 30; x < P.pos.x + 30; x++) for (let z = Math.floor(P.pos.z) - 30; z < P.pos.z + 30; z++)
                for (let y = 12; y < 30; y++) if ((w.get(x,y,z) === 5 || w.get(x,y,z) === 7) && w.solid(x,y-1,z) && w.get(x,y-1,z) !== 5 && w.get(x,y-1,z) !== 7 && !w.solid(x-1,y,z) && !w.solid(x-1,y+1,z)) { const d = Math.hypot(x - P.pos.x, z - P.pos.z); if (!best || d < best.d) best = {x,y,z,d}; }
              const t = best;
              P.pos.set(t.x - 0.9, t.y, t.z + 0.5); P.vel.set(0,0,0);
              g.selectSlot(0);
              const res = [];
              for (let k = 0; k < 3; k++) res.push(window.__mine(t.x, t.y + k, t.z, 4));
              // a tree can fall whole at the first cut: fell more of them until the quest's 3 wood are in
              const tried = new Set();
              for (let n = 0; n < 10 && g.inv.wood < 3; n++) {
                let tb = null;
                // a real tree: a trunk at least three logs tall (the trading post's posts can't be cut)
                for (let x = Math.floor(P.pos.x) - 40; x < P.pos.x + 40; x++) for (let z = Math.floor(P.pos.z) - 40; z < P.pos.z + 40; z++)
                  for (let y = 12; y < 30; y++) { const id = w.get(x,y,z); if ((id === 5 || id === 7) && w.get(x,y+2,z) === id && !tried.has(x + ',' + z) && w.solid(x,y-1,z) && w.get(x,y-1,z) !== 5 && w.get(x,y-1,z) !== 7 && !w.solid(x-1,y,z) && !w.solid(x-1,y+1,z)) { const d = Math.hypot(x - P.pos.x, z - P.pos.z); if (!tb || d < tb.d) tb = { x, y, z, d }; } }
                if (tb) tried.add(tb.x + ',' + tb.z);
                if (!tb) break;
                P.pos.set(tb.x - 0.9, tb.y, tb.z + 0.5); P.vel.set(0,0,0);
                res.push(window.__mine(tb.x, tb.y, tb.z, 4)); window.__sim(0.5);
              }
              return { t, res, wood: g.inv.wood, stats: g.stats.wood, obj: g.quests.tracked_().text };
            }''')
            print('chop', json.dumps(r))
            await page.wait_for_timeout(300)
            await shot(page, 'f1_chopped')
            # 2. craft planks through the bag sheet
            await page.wait_for_timeout(2500)
            await page.keyboard.press('Tab')
            await page.wait_for_timeout(700)
            await shot(page, 'f2_craft')
            await page.click('#sheet .recipe button:has-text("Craft") >> nth=0')
            await page.wait_for_timeout(300)
            print('craft', await ev(page, '() => { const g = window.__brinebound; return { plank: g.inv.plank, wood: g.inv.wood, crafted: g.stats.crafted, obj: g.quests.tracked_().text } }'))
            await page.keyboard.press('Escape')
            await page.wait_for_timeout(300)
            # 3. board and take the helm
            r = await ev(page, '''() => {
              const g = window.__brinebound, P = g.player, s = g.sloop;
              const c = Math.cos(s.heading), sn = Math.sin(s.heading);
              const k = s.size, lx = 0, lz = 3.4 * k;   // the helm, on a ship drawn k times the plan
              P.pos.set(s.pos.x + lx * c + lz * sn, s.pos.y + 1.2 * k, s.pos.z - lx * sn + lz * c); P.vel.set(0,0,0);
              window.__sim(0.3);
              const m1 = P.mode;
              g.input.pressed.add('use'); window.__sim(0.1);
              return { m1, mode: P.mode, chapter: g.quests.chapter, obj: g.quests.tracked_().text };
            }''')
            print('helm', r)
            await page.wait_for_timeout(500)
            await shot(page, 'f3_helm')
            # 4. sail: move the ship near the treasure island, then dig the X
            r = await ev(page, '''() => {
              const g = window.__brinebound, P = g.player, w = g.world, fm = w.firstMap;
              const o = w.islands[fm.island];
              // find water near the island for the ship
              let spot = null;
              for (let a = 0; a < 6.28 && !spot; a += 0.2) { const x = o.x + Math.cos(a) * (o.r + 12), z = o.z + Math.sin(a) * (o.r + 12); if (!g.sloop.hullHits(w, x, z, a)) spot = {x, z, a}; }
              g.sloop.place(spot.x, spot.z, spot.a);
              g.input.pressed.add('use'); window.__sim(0.1); // leave helm
              const top = w.topSolid(fm.x, fm.z);
              P.mode = 'foot'; P.pos.set(fm.x + 1.5, top + 1, fm.z + 0.5); P.vel.set(0,0,0);
              g.selectSlot(1);
              const dug = [];
              for (let y = top; y >= fm.y; y--) dug.push([y, w.get(fm.x, y, fm.z), window.__mine(fm.x, y, fm.z, 5)]);
              return { dug, gold: g.gold, chests: g.stats.chests, chapter: g.quests.chapter, phase: g.quests.phase, enemies: g.enemies.list.length, obj: g.quests.tracked_().text };
            }''')
            print('dig', json.dumps(r))
            await ev(page, '() => window.__sim(1.3)')
            await page.wait_for_timeout(400)
            await shot(page, 'f4_guards')
            await ev(page, '() => { window.__brinebound.camMode = "third"; window.__sim(0.1); }')
            await page.wait_for_timeout(400)
            await shot(page, 'f4b_guards_third')
            await ev(page, '() => { window.__brinebound.camMode = "first"; }')
            r = await ev(page, '''() => { const g = window.__brinebound; g.selectSlot(0); const left = window.__fight(25); return { left, kills: g.stats.kills, gold: g.gold, hp: g.player.hp, hollows: g.hollows.length, bone: g.inv.bone }; }''')
            print('fight', r)
            r = await ev(page, '''() => { const g = window.__brinebound; window.__sim(8); return { hollows: g.hollows.map(h => ({ x: h.pos.x|0, z: h.pos.z|0, hp: h.hp, v: h.variant })), timers: g.timers.length }; }''')
            print('hollow', r)
            # 5. sea battle: put the player at the helm next to the hollow
            r = await ev(page, '''() => {
              const g = window.__brinebound, P = g.player, s = g.sloop, h = g.hollows[0];
              if (!h) return 'no hollow';
              g.boardSloop(0, 3.75); g.input.pressed.add('use'); window.__sim(0.05);
              s.place(h.pos.x + Math.cos(h.heading) * 22, h.pos.z - Math.sin(h.heading) * 22, h.heading);
              let shots = 0, t0 = 0;
              window.__sim(60, (g, t) => {
                if (h.sinking) return false;
                const dx = h.pos.x - s.pos.x, dz = h.pos.z - s.pos.z;
                const rx = Math.cos(s.heading), rz = -Math.sin(s.heading);
                const side = dx * rx + dz * rz > 0 ? 1 : -1;
                g.input.pressed.add(side > 0 ? 'star' : 'port'); shots++;
                g.inv.ball = Math.max(g.inv.ball, 6); s.hp = Math.max(s.hp, 40);
              });
              return { sunk: h.sinking, hhp: h.hp, shp: s.hp, mode: P.mode, loot: g.props.loot.length, ships: g.stats.ships };
            }''')
            print('battle', r)
            await page.wait_for_timeout(400)
            await shot(page, 'f5_battle')
            r = await ev(page, '''() => {
              const g = window.__brinebound, s = g.sloop, L = g.props.loot[0];
              if (!L) return 'no loot';
              const before = g.gold;
              s.place(L.x + 1, L.z + 1, s.heading); window.__sim(0.3);
              return { before, after: g.gold, loot: g.props.loot.length };
            }''')
            print('salvage', r)
            # 6. bank with Old Mags through the dialog
            r = await ev(page, '''() => {
              const g = window.__brinebound, P = g.player, m = g.npcs.get('mags');
              g.input.pressed.add('use'); window.__sim(0.05);
              P.mode = 'foot'; P.pos.set(m.site.x + 1.6, m.site.y, m.site.z + 0.2); P.vel.set(0,0,0);
              window.__aimAt(m.site.x, m.site.y + 1.5, m.site.z);
              window.__sim(0.2);
              const it = g.interaction;
              g.input.pressed.add('use'); window.__sim(0.05);
              return { it, state: g.state, sheet: g.sheets.name, gold: g.gold };
            }''')
            print('talk', r)
            await page.wait_for_timeout(600)
            await shot(page, 'f6_mags')
            await page.click('#sheet button:has-text("Bank")')
            await page.wait_for_timeout(500)
            print('banked', await ev(page, '() => { const g = window.__brinebound; return { gold: g.gold, banked: g.banked, chapter: g.quests.chapter, phase: g.quests.phase } }'))
            await shot(page, 'f7_mags_oil')
            await page.click('#sheet button:has-text("Take the crate")')
            await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Accept") >> nth=0')
            await page.wait_for_timeout(300)
            print('oil+contract', await ev(page, '() => { const g = window.__brinebound; return { oil: g.inv.oil, phase: g.quests.phase, active: g.quests.active.map(q => q.title), obj: g.quests.tracked_().text } }'))
            await page.click('#sheet button:has-text("Trade")')
            await page.wait_for_timeout(500)
            await shot(page, 'f8_shop')
            await page.click('#sheet .shopitem button:has-text("Buy") >> nth=-5')
            await page.wait_for_timeout(300)
            print('bought', await ev(page, '() => { const g = window.__brinebound; return { banked: g.banked, ball: g.inv.ball } }'))
            await page.keyboard.press('Escape')
            await page.wait_for_timeout(300)
            await page.keyboard.press('KeyJ')
            await page.wait_for_timeout(500)
            await shot(page, 'f9_quests')
            await page.keyboard.press('KeyP')
            await page.wait_for_timeout(500)
            await page.click('#sheet button:has-text("Save")')
            await page.wait_for_timeout(800)
            await shot(page, 'f10_saves')
            await page.click('#sheet .slotcard button:has-text("Save here") >> nth=0')
            await page.wait_for_timeout(800)
            snap = await ev(page, '() => { const g = window.__brinebound; return { banked: g.banked, chapter: g.quests.chapter, oil: g.inv.oil, active: g.quests.active.length, edits: g.world.edits.size, wood: g.inv.wood, look: g.look.name } }')
            print('before reload', snap)
            await page.reload()
            await page.wait_for_function('window.__brinebound && window.__brinebound.state === "title"', timeout=60000)
            await page.wait_for_timeout(800)
            await shot(page, 'f11_title_continue')
            await page.click('#bContinue')
            await page.wait_for_function('window.__brinebound.state === "play"', timeout=60000)
            await page.wait_for_timeout(800)
            after = await ev(page, '() => { const g = window.__brinebound; return { banked: g.banked, chapter: g.quests.chapter, oil: g.inv.oil, active: g.quests.active.length, edits: g.world.edits.size, wood: g.inv.wood, look: g.look.name } }')
            print('after reload', after, 'MATCH' if after == snap else 'MISMATCH')
            await shot(page, 'f12_continued')
            errs = [l for l in logs if 'error' in l.lower()]
            print('\n'.join(errs[-20:]) or 'no errors')
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
