import asyncio
import json
import os
import subprocess

from playwright.async_api import async_playwright


async def main():
    html = subprocess.check_output([
        'node', '--input-type=module', '-e',
        "import {bundle} from './tools/bundle.mjs'; process.stdout.write(await bundle({offline:true}));",
    ])
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=os.environ.get('CHROME', '/usr/bin/chromium'),
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        )
        page = await browser.new_page(viewport={'width': 1280, 'height': 720})
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await page.route('http://game.test/**', lambda r: r.fulfill(body=html, content_type='text/html'))
        await page.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(body='', content_type='text/css'))
        await page.route('https://fonts.gstatic.com/**', lambda r: r.abort())
        await page.goto('http://game.test/')
        await page.wait_for_function('window.__brinebound && window.__brinebound.state === "title"', timeout=120000)
        await page.click('#bStart')
        await page.click('#sheet button:has-text("Set sail")')
        await page.wait_for_function('window.__brinebound.state === "play"', timeout=120000)
        result = await page.evaluate('''() => {
          const g = window.__brinebound, w = g.world;
          return ['ironhook', 'seer', 'blackstone'].map(id => {
            const n = g.npcs.get(id), s = w.sites[id];
            if (!n || !s) return {id, missing:true};
            const x = Math.floor(s.x), z = Math.floor(s.z);
            return {id, name:n.def.name, island:w.islands[w.islandAt(x,z)]?.name,
              y:s.y, ground:w.topSolid(x,z)+1, blocked:w.solid(x,s.y,z) || w.solid(x,s.y+1,z),
              nearby: [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz]) =>
                Math.abs(w.standY(x+dx,z+dz)-s.y) <= 1.1 &&
                !w.solid(x+dx,s.y,z+dz) && !w.solid(x+dx,s.y+1,z+dz)),
              offers:g.quests.dialog(id).offers.map(o=>o.kind)};
          });
        }''')
        print(json.dumps(result, indent=2))
        assert [x.get('island') for x in result] == ['Smuggler’s Hollow', 'Marrow Cay', 'Fort Brackwater']
        assert all(not x.get('missing') and not x['blocked'] and x['nearby'] and x['y'] == x['ground'] and x['offers'] for x in result)
        rescue = await page.evaluate('''() => {
          const g = window.__brinebound, Q = g.quests;
          const offer = Q.offers.ironhook.find(o => o.kind === 'rescue');
          if (!offer || !Q.accept('ironhook', offer.oid)) return {accepted:false};
          const q = Q.active[Q.active.length - 1], camp = Q.camps[q.camp];
          g.world.buildNear(camp.x, camp.z, 20);
          g.world.processDirty(100);
          Q.onSkeletonKilled({campId:camp.id, captain:true});
          g.npcs.update(0.01);
          const id = 'survivor:' + q.id, npc = !!g.npcs.get(id), d = Q.dialog(id);
          if (d.story) d.story.act();
          g.player.pos.set(camp.x + 8, camp.y, camp.z);
          const start = {...q.survivor};
          for (let i=0;i<20;i++) Q.update(0.1);
          const moved = Math.hypot(q.survivor.x-start.x, q.survivor.z-start.z);
          const saved = JSON.parse(JSON.stringify(Q.serialize()));
          Q.load(saved); g.npcs.update(0.01);
          const loaded = Q.active.find(x => x.id === q.id);
          const escorting = loaded.escorting, savedHealth = loaded.survivor.hp, restoredNpc = !!g.npcs.get(id);
          g.sloop.place(loaded.survivor.x + 5, loaded.survivor.z, 0);
          g.boardSloop(0, 1);
          Q.update(0.1);
          const ready = loaded.state === 'ready', reward = loaded.reward, before = g.banked;
          Q.turnIn(loaded.id, 'ironhook');
          return {accepted:true, npc, escorting, moved, savedHealth, restoredNpc, ready, reward, paid:g.banked-before, removed:!Q.active.some(x => x.id === q.id)};
        }''')
        print('rescue:', json.dumps(rescue))
        assert rescue['accepted'] and rescue['npc'] and rescue['escorting'] and rescue['moved'] > 0.1 and rescue['savedHealth'] > 0 and rescue['restoredNpc']
        assert rescue['ready'] and rescue['reward'] > 0 and rescue['paid'] == rescue['reward'] and rescue['removed']
        prophecy = await page.evaluate('''() => {
          const g = window.__brinebound, Q = g.quests;
          const offer = Q.offers.seer.find(o => o.kind === 'prophecy');
          if (!offer || !Q.accept('seer', offer.oid)) return {accepted:false};
          const q = Q.active[Q.active.length - 1], block = g.world.get(q.x,q.y,q.z);
          const before = q.state;
          g.world.set(q.x,q.y,q.z,0);
          g.openChest(q.x,q.y,q.z);
          const ready = q.state === 'ready', reward = q.reward, banked = g.banked;
          Q.turnIn(q.id, 'seer');
          return {accepted:true, block, before, ready, reward, paid:g.banked-banked, removed:!Q.active.some(x=>x.id === q.id)};
        }''')
        print('prophecy:', json.dumps(prophecy))
        assert prophecy['accepted'] and prophecy['block'] and prophecy['before'] == 'active' and prophecy['ready']
        assert prophecy['reward'] > 0 and prophecy['paid'] == prophecy['reward'] and prophecy['removed']
        await page.wait_for_timeout(1000)
        assert not errors, errors
        await browser.close()


asyncio.run(main())
