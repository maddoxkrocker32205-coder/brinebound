import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM

async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'low'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            r = await page.evaluate('''() => {
              const g = window.__brinebound, Q = g.quests, out = {};
              Q.step = 3; Q.flags.lit = true;
              const kinds = {};
              // generate lots of offers to see every kind
              for (let i = 0; i < 60; i++) { for (const npc of ['mags', 'tallow']) { const o = Q.genOffer(npc); kinds[o.kind] = (kinds[o.kind] || 0) + 1; } }
              out.kinds = kinds;
              const take = (npc, kind) => { for (let i = 0; i < 80; i++) { Q.offers[npc] = [Q.genOffer(npc)]; if (Q.offers[npc][0].kind === kind && (kind !== 'supply' || npc === 'mags')) break; } return Q.accept(npc, Q.offers[npc][0].oid) ? Q.active[Q.active.length - 1] : null; };
              // supply
              let q = take('mags', 'supply'); g.inv[q.item] = q.need; Q.update(0.1); out.supplyState = q.state;
              let before = g.banked; Q.turnIn(q.id, 'mags'); out.supplyPaid = g.banked - before; out.supplyLeft = g.inv[q.item];
              // delivery
              q = take('mags', 'delivery'); out.cargo = g.inv[q.cargo];
              let d = Q.dialog(q.to); out.deliveryReady = d.ready.some(x => x.id === q.id);
              before = g.banked; Q.turnIn(q.id, q.to); out.deliveryPaid = g.banked - before; out.cargoAfter = g.inv[q.cargo];
              // bounty
              q = take('tallow', 'bounty'); const camp = Q.camps[q.camp]; out.bountyCamp = !!camp && camp.active;
              const P = g.player; P.mode = 'foot'; P.pos.set(camp.x + 6, camp.y + 0.2, camp.z); P.pos.y = g.world.standY(Math.floor(P.pos.x), Math.floor(P.pos.z)) + 0.01;
              window.__sim(1.5);
              out.bountySpawn = g.enemies.list.filter(s => s.campId === camp.id).map(s => s.kind);
              const cap = g.enemies.list.find(s => s.campId === camp.id && s.captain); if (cap) { cap.state = 'walk'; cap.hurt(999, null); }
              out.bountyState = q.state;
              before = g.banked; Q.turnIn(q.id, 'tallow'); out.bountyPaid = g.banked - before;
              // chart
              q = take('mags', 'chart'); out.chart = { torn: q.torn, island: q.island, x: q.x, z: q.z, chest: g.world.get(q.x, q.y, q.z) };
              const gold0 = g.gold; g.world.set(q.x, q.y, q.z, 0); g.openChest(q.x, q.y, q.z); out.chartGold = g.gold - gold0; out.chartActive = Q.active.some(x => x.id === q.id);
              // hunt
              q = take('tallow', 'hunt'); g.boardSloop(0, 1); window.__sim(17);
              const h = g.hollowFor(q.id); out.huntSpawned = !!h;
              if (h) { h.damage(9999, g); }
              out.huntState = q.state;
              // explore
              q = take('mags', 'explore'); for (let i = 0; i < g.world.islands.length; i++) if (!Q.discovered.includes(i)) Q.discovered.push(i); Q.update(0.1); out.exploreState = q && q.state;
              out.active = Q.active.map(x => x.kind + ':' + x.state); out.level = g.level; out.contracts = Q.stats.contracts;
              return out;
            }''')
            print(json.dumps(r, indent=1))
            errs = [l for l in logs if 'error' in l.lower()]
            print('\n'.join(errs[-10:]) or 'no errors')
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
