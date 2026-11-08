import asyncio, sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *
G = 'window.__brinebound'
TAG = sys.argv[1] if len(sys.argv) > 1 else 'now'
# Phone HUD layout: screenshots on foot, at the helm and in a fight, plus a check that no two HUD pieces overlap.
BOXES = '''() => {
  const ids = ['captainRow','mHp','mFood','gold','goal','crewPanel','shipPanel','compass','bMap','bQuests','bBag','bMenu','tChat','enemyPanel','hotbar','tView','tEmote','tUse','tPort','tStar','tPlace','tJump','tCrouch','tRepair','tHit'];
  const vis = (el) => { if (!el) return false; for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const out = {};
  for (const id of ids) { const el = document.getElementById(id); if (!vis(el)) continue; const r = el.getBoundingClientRect(); out[id] = [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }
  const hit = [], ks = Object.keys(out);
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) { const a = out[ks[i]], b = out[ks[j]]; if (a[0] < b[2] - 1 && b[0] < a[2] - 1 && a[1] < b[3] - 1 && b[1] < a[3] - 1) hit.push(ks[i] + '/' + ks[j]); }
  const off = ks.filter((k) => { const a = out[k]; return a[0] < 0 || a[1] < 0 || a[2] > innerWidth || a[3] > innerHeight; });
  let area = 0; for (const k of ks) { const a = out[k]; area += (a[2] - a[0]) * (a[3] - a[1]); }
  return { overlaps: hit, offscreen: off, cover: Math.round(100 * area / (innerWidth * innerHeight)) + '%', boxes: out };
}'''

async def one(p, w, h, label):
    b, page, logs = await setup(p, mobile=True, w=w, h=h)
    await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: 'low'}))")
    await load(page)
    await page.wait_for_timeout(800)
    await page.screenshot(path=f'{SHOTS}/t67_{TAG}_{label}_title.png')
    await page.tap('#bStart'); await page.wait_for_timeout(400)
    await page.tap('#sheet button:has-text("Set sail")')
    await page.wait_for_function(f'{G}.state === "play"', timeout=30000)
    await page.wait_for_timeout(7000)   # let the opening toasts pass
    res = {}
    res['foot'] = await page.evaluate(BOXES)
    await page.screenshot(path=f'{SHOTS}/t67_{TAG}_{label}_foot.png')
    await page.evaluate(f'() => {{ const g = {G}; g.boardSloop(0, -4); g.doInteraction({{ id: "helm" }}); }}')
    await page.wait_for_timeout(1500)
    res['helm'] = await page.evaluate(BOXES)
    await page.screenshot(path=f'{SHOTS}/t67_{TAG}_{label}_helm.png')
    await page.evaluate(f'''() => {{ const g = {G}, s = g.sloop; let best = null; for (const h of g.hollows) if (!h.sinking && (!best || h.kind !== 'hollow')) best = h;
      if (best) {{ best.pos.x = s.pos.x + 40 * Math.cos(s.heading); best.pos.z = s.pos.z - 40 * Math.sin(s.heading); }}
      s.hp = s.maxHp * 0.6; g.inv.plank = 4; g.player.hp = g.player.maxHp * 0.5; }}''')
    await page.wait_for_timeout(1200)
    res['fight'] = await page.evaluate(BOXES)
    await page.screenshot(path=f'{SHOTS}/t67_{TAG}_{label}_fight.png')
    await page.evaluate(f'() => {{ const g = {G}; g.doInteraction({{ id: "leaveHelm" }}); }}')
    await page.wait_for_timeout(1200)
    res['deck'] = await page.evaluate(BOXES)
    await page.screenshot(path=f'{SHOTS}/t67_{TAG}_{label}_deck.png')
    for k, v in res.items():
        print(label, k, 'overlaps:', v['overlaps'], 'offscreen:', v['offscreen'], 'cover:', v['cover'])
    if '-v' in sys.argv: print(json.dumps(res['fight']['boxes']))
    errs = [l for l in logs if 'error' in l.lower()]
    if errs: print(label, 'errors', errs[:5])
    await b.close()

async def main():
    srv = serve(); await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            await one(p, 393, 590, 'artifact_portrait')   # iPhone, claude.ai artifact page in Safari
            await one(p, 393, 660, 'safari_portrait')
            await one(p, 852, 340, 'safari_landscape')
            await one(p, 667, 300, 'se_landscape')
    finally:
        srv.terminate()
asyncio.run(main())
