import asyncio, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
from simlib import SIM
G = 'window.__brinebound'
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b, page, logs = await setup(p, w=960, h=540)
            await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'high'}))")
            await load(page)
            await page.click('#bStart'); await page.wait_for_timeout(300)
            await page.click('#sheet button:has-text("Set sail")'); await page.wait_for_timeout(500)
            await page.evaluate(SIM)
            world = await page.evaluate(f'''() => {{
              const w = {G}.world, extended = w.islands.filter((o) => o.extended), villages = w.sites.villages;
              return {{ map: [w.bw, w.bd], islands: w.islands.length, extended: extended.length,
                villages: villages.length, ruins: w.sites.loot.filter((q) => q.kind === 'ruin').length,
                settledExtended: villages.filter((v) => w.islands[v.island]?.extended).length }};
            }}''')
            assert world == {'map': [1824, 1824], 'islands': 54, 'extended': 8, 'villages': 24, 'ruins': 8, 'settledExtended': 8}, world
            print('expanded settlements', world)
            access = await page.evaluate(f'''() => {{
              const w = {G}.world, failures = [];
              for (const s of w.sites.structures.filter((q) => q.type === 'house')) {{
                const x = Math.floor(s.doorX), z = Math.floor(s.doorZ);
                for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy < 2; dy++) {{
                  if (w.solid(x + dx, s.floor + dy, z)) failures.push([s.role, x + dx, s.floor + dy, z]);
                }}
                if (w.solid(s.x, s.floor, s.z) || w.solid(s.x, s.floor + 1, s.z)) failures.push([s.role, 'interior', s.x, s.floor, s.z]);
              }}
              const outpost = w.structureDetails.find((q) => q.type === 'outpost');
              if (!outpost || !w.solid(outpost.x + 2, outpost.g + 2, outpost.z + 2) ||
                  !w.solid(outpost.x + 2, outpost.g + 1, outpost.z + 2)) failures.push(['outpost lamp', outpost]);
              const dock = w.dock, shoreX = Math.round(dock.x - 17), shoreZ = Math.round(dock.z - 7);
              const coveEdges = [[shoreX + 16, shoreZ - 3], [shoreX + 16, shoreZ + 20]];
              const blockedWater = coveEdges.filter(([x, z]) => w.dryColumn(x, z));
              if (blockedWater.length) failures.push(['dock cove', blockedWater]);
              const s = w.sites.structures[0], wallZ = Math.floor(s.doorZ), startZ = wallZ + 1.5;
              w.buildNear(s.doorX, s.z, 32);
              const threshold = w.walkStep(s.doorX, s.floor, startZ, s.doorX, startZ - 1);
              const inside = Number.isNaN(threshold) ? threshold : w.walkStep(s.doorX, threshold, startZ - 1, s.doorX, startZ - 2);
              const cs = 16, nc = w.bw / cs, key = Math.floor(outpost.x / cs) + Math.floor(outpost.z / cs) * nc;
              w.buildChunk(key);
              const details = w.meshes.get(key + ':a');
              return {{ houses: w.sites.structures.length, failures, walkable: !Number.isNaN(threshold) && !Number.isNaN(inside),
                dockWaterCells: coveEdges.length - blockedWater.length,
                outpostDetailVertices: details?.geometry.attributes.position.count || 0 }};
            }}''')
            assert access['houses'] > 0 and not access['failures'] and access['walkable'] and access['dockWaterCells'] == 2 and access['outpostDetailVertices'] > 0, access
            print('house access, anchored outpost lantern and detail mesh', access)
            support = await page.evaluate(f'''() => {{
              const w = {G}.world, missing = [];
              const check = (kind, x, z, baseY) => {{
                if (!w.solid(x, baseY - 1, z) && missing.length < 20) missing.push([kind, x, z, baseY]);
              }};
              for (const v of w.sites.villages) {{
                const o = w.islands[v.island], cx = Math.floor(v.x), cz = Math.floor(v.z), g = v.y;
                const major = v.tier === 'major', village = v.tier === 'village';
                const radius = Math.min(major ? 42 : village ? 27 : 19, Math.floor(o.r * 0.55));
                const spacing = Math.max(7, Math.floor(radius / (major ? 3.5 : village ? 2.5 : 2)));
                const grid = major ? [-2, -1, 0, 1, 2] : [-1, 0, 1];
                const roadLimit = Math.max(1, radius - 7);
                for (let lane = 0; lane <= grid.length; lane++) {{
                  const road = Math.round((lane - grid.length / 2) * spacing);
                  for (let k = -roadLimit; k <= roadLimit; k++) {{
                    check('road', cx + road, cz + k, g);
                    check('road', cx + k, cz + road, g);
                  }}
                }}
                for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) check('plaza', cx + dx, cz + dz, g);
                for (const gx of grid) for (const gz of grid) {{
                  if ((gx === 0 && gz === 0) || (gz === 0 && gx > 0) || (!major && !village && Math.abs(gx) !== 1)) continue;
                  const role = major && gx === -1 && gz === 0 ? 'inn' : major && gx === 0 && gz === -1 ? 'chapel' : gx === 1 && gz === 1 ? 'market' : gx === 0 && gz === 1 ? 'warehouse' : gx === -2 && gz === -1 ? 'workshop' : 'house';
                  const wide = role === 'chapel' || role === 'inn' || role === 'warehouse';
                  const hw = wide ? (major ? 4 : 3) : (major ? 3 : 2), hd = hw;
                  const hx = cx + gx * spacing, hz = cz + gz * spacing;
                  for (let dx = -hw - 1; dx <= hw + 1; dx++) for (let dz = -hd - 1; dz <= hd + 1; dz++) {{
                    if (Math.abs(dx) === hw + 1 || Math.abs(dz) === hd + 1) check('house foundation', hx + dx, hz + dz, g - 1);
                    else check('house floor', hx + dx, hz + dz, g);
                  }}
                  for (let dx = -1; dx <= 1; dx++) check('porch', hx + dx, hz + hd + 1, g);
                }}
                const stallOffset = Math.max(3, Math.floor(spacing / 3));
                const stalls = [[-stallOffset, -stallOffset], [stallOffset, -stallOffset], [-stallOffset, stallOffset], [stallOffset, stallOffset]];
                for (let stall = 0; stall < 2; stall++) {{
                  const [dx, dz] = stalls[(v.island + stall) % stalls.length], alongX = dx * dz > 0;
                  for (let k = -1; k <= 1; k++) check('stall', cx + dx + (alongX ? k : 0), cz + dz + (alongX ? 0 : k), g);
                }}
                const lights = major ? [-2, -1, 0, 1, 2] : [-1, 0, 1];
                for (const k of lights) for (const [x, z] of [[cx + k * spacing, cz - radius + 3], [cx + k * spacing, cz + radius - 3], [cx - radius + 3, cz + k * spacing], [cx + radius - 3, cz + k * spacing]]) check('lamp post', x, z, g + 1);
              }}
              if (w.sites.camp) {{
                const cx = Math.floor(w.sites.camp.x), cz = Math.floor(w.sites.camp.z);
                for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) check('camp', cx + dx, cz + dz, w.sites.camp.y);
              }}
              if (w.sites.fort) for (let dx = -9; dx <= 9; dx++) for (let dz = -9; dz <= 9; dz++) check('fort', Math.floor(w.sites.fort.x) + dx, Math.floor(w.sites.fort.z - 3.5) + dz, w.sites.fort.y);
              if (w.sites.lighthouse) {{
                const x = Math.floor(w.sites.lighthouse.x), z = Math.floor(w.sites.lighthouse.z), g = w.sites.lighthouse.base;
                for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) check('lighthouse', x + dx, z + dz, g);
                for (let dx = 0; dx < 4; dx++) for (let dz = 0; dz < 4; dz++) check('keeper hut', x + 6 + dx, z - 1 + dz, g);
              }}
              for (const r of w.sites.loot.filter((q) => q.kind === 'ruin')) for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) check('ruin', r.x + dx, r.z + dz, r.y - 1);
              let treeRoots = 0, unsupportedTrees = 0;
              for (let z = 0; z < w.bd; z++) for (let x = 0; x < w.bw; x++) {{
                const y = w.surf[x + z * w.bw], id = w.get(x, y, z);
                if (id === 5 || id === 7 || id === 25) {{
                  treeRoots++;
                  if (!w.solid(x, y - 1, z)) unsupportedTrees++;
                }}
              }}
              const plane = w.bw * w.bd, height = w.data.length / plane, foliage = new Set();
              for (let y = 60; y < height; y++) for (let i = y * plane; i < (y + 1) * plane; i++) {{
                const id = w.data[i];
                if (id === 6 || id === 8 || id === 12 || id === 26 || id === 40) foliage.add(i);
              }}
              let detachedFoliage = 0;
              while (foliage.size) {{
                const seed = foliage.values().next().value;
                foliage.delete(seed);
                const queue = [seed];
                let anchored = false;
                for (let head = 0; head < queue.length; head++) {{
                  const i = queue[head], y = Math.floor(i / plane), rem = i - y * plane;
                  const z = Math.floor(rem / w.bw), x = rem - z * w.bw;
                  for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {{
                    const xx = x + dx, yy = y + dy, zz = z + dz;
                    if (xx < 0 || yy < 0 || zz < 0 || xx >= w.bw || yy >= height || zz >= w.bd) continue;
                    const n = xx + w.bw * (zz + w.bd * yy), id = w.data[n];
                    if (id === 5 || id === 7 || id === 25) anchored = true;
                    if (foliage.delete(n)) queue.push(n);
                  }}
                }}
                if (!anchored) detachedFoliage += queue.length;
              }}
              return {{ missing, treeRoots, unsupportedTrees, detachedFoliage }};
            }}''')
            assert not support['missing'] and support['unsupportedTrees'] == 0 and support['detachedFoliage'] == 0, support
            print('grounded world structures', support)
            await page.evaluate(f'() => {{ const g = {G}; g.ui.toastsEl.style.display = "none"; g.time = 40; }}')
            names = await page.evaluate(f'() => {G}.world.islands.slice(-6).map((o) => [o.name, o.type, Math.round(o.x), Math.round(o.z), +o.r.toFixed(1)])')
            print('new islands', names)
            for name, typ, x, z, r in names:
                # hover the camera above and beside each island and look at it
                await page.evaluate(f'''() => {{ const g = {G}, P = g.player, o = g.world.islands.find((q) => q.name === "{name}");
                  const a = 0.6, d = o.r * 1.9; P.pos.set(o.x + Math.cos(a) * d, 30, o.z + Math.sin(a) * d); P.vel.set(0, 0, 0);
                  P.yaw = Math.atan2(-(o.x - P.pos.x), -(o.z - P.pos.z)); P.pitch = -0.45; g.camMode = 'first';
                  g.world.buildNear(o.x, o.z, o.r * 2.2 + 16);
                  window.__sim(0.05, () => {{ P.pos.y = 30; P.vel.set(0, 0, 0); }}); }}''')
                await page.wait_for_timeout(500)
                await shot(page, f't57_{typ}')
            # the fort's garrison wakes when you come ashore
            r = await page.evaluate(f'''() => {{ const g = {G}, P = g.player, f = g.world.sites.fort, camp = g.quests.camps.fort;
              P.pos.set(f.x + 8, f.y + 1, f.z + 8); P.vel.set(0, 0, 0); window.__sim(1.5, () => {{ P.hp = 100; }});
              return {{ camp: camp && {{ active: camp.active, spawned: camp.spawned, total: camp.total }}, guards: g.enemies.list.filter((s) => s.campId === 'fort').length }}; }}''')
            print('fort camp', r)
            print('errors', [l for l in logs if 'error' in l.lower()][:6])
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
