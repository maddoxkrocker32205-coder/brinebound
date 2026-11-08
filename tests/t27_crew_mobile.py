import asyncio, sys, time
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from crewlib import *
from simlib import SIM
G = 'window.__brinebound'
async def wait_for(page, expr, timeout=30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if await page.evaluate(expr): return True
        except Exception: pass
        await asyncio.sleep(0.25)
    return False
async def main():
    srv = serve(); await asyncio.sleep(0.8)
    relay = Relay()
    try:
        async with async_playwright() as p:
            b, (A, Bp), (la, lb) = await crew_pages(p, relay, w=844, h=390, mobile=(1,))
            await A.goto('http://127.0.0.1:8765/brinebound.html')
            await Bp.goto('http://127.0.0.1:8765/brinebound.html')
            await A.wait_for_function('window.__brinebound && window.__brinebound.state === "title"', timeout=90000)
            await Bp.wait_for_function('window.__brinebound && window.__brinebound.state === "title"', timeout=90000)
            await asyncio.sleep(1)
            vis = await Bp.evaluate("!document.getElementById('bCrew').classList.contains('hidden')")
            print('title shows Sail with friends:', vis)
            await shot(Bp, 'm_title')
            # host starts normally
            await A.click('#bStart'); await A.wait_for_timeout(300)
            await A.evaluate('() => { const g = window.__brinebound; g.look.name = "Captain Anne"; g.applyLook("all"); }')
            await A.click('#sheet button:has-text("Set sail")')
            await A.wait_for_function('window.__brinebound.state === "play"')
            await render(A, False); await A.evaluate(SIM)
            await A.evaluate(f'{G}.net.startHost()')
            # the phone player taps Sail with friends on the title: a new captain, then the crew list
            await Bp.tap('#bCrew'); await Bp.wait_for_timeout(500)
            await Bp.evaluate('() => { const g = window.__brinebound; g.look.name = "Captain Bonny"; g.applyLook("all"); }')
            await Bp.tap('#sheet button:has-text("Set sail")')
            ok = await wait_for(Bp, f"{G}.state === 'sheet' && {G}.sheets.name === 'crew'", 10)
            print('crew list opened after setting sail:', ok)
            await shot(Bp, 'm_crewlist')
            await Bp.tap('#sheet button:has-text("Join")')
            ok = await wait_for(Bp, f'{G}.net.inCrew && {G}.state === "play"', 45)
            print('joined from phone', ok)
            await asyncio.sleep(1.5)
            vis = await Bp.evaluate("!document.getElementById('tChat').classList.contains('hidden')")
            print('chat button visible on phone:', vis)
            await Bp.tap('#tChat'); await Bp.wait_for_timeout(300)
            await Bp.fill('#chatInput', 'Typing from my phone')
            await Bp.press('#chatInput', 'Enter')
            await asyncio.sleep(1.2)
            print('host got:', await A.evaluate(f'() => {G}.net.chat.map(c => c.t)'))
            await A.evaluate(f"{G}.net.sendChat('Welcome aboard!')")
            await asyncio.sleep(1.2)
            await shot(Bp, 'm_crew_hud')
            await Bp.evaluate(f"{G}.openSheet('menu')"); await Bp.wait_for_timeout(400)
            await shot(Bp, 'm_menu')
            await Bp.tap('#sheet button:has-text("Crew")'); await Bp.wait_for_timeout(500)
            await shot(Bp, 'm_crewsheet')
            print('errors A', errors(la)[-5:]); print('errors B', errors(lb)[-5:])
            await b.close()
    finally:
        relay.stop(); srv.terminate()
asyncio.run(main())
