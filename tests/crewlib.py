import asyncio, json, random, sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from harness import *

MOCK = open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'mockroom.js')).read()


class Relay:
    """Carries mock-room messages between pages: fixed latency, in order, with some presence updates dropped."""
    def __init__(self, latency=0.06, drop=0.05):
        self.pages = []
        self.queues = {}
        self.latency = latency
        self.drop = drop
        self.tasks = []
        self.count = 0
        self.dropped = 0

    def add(self, page):
        q = asyncio.Queue()
        self.pages.append(page)
        self.queues[page] = q
        self.tasks.append(asyncio.ensure_future(self.pump(page, q)))

    def out(self, source_page, msg):
        loop = asyncio.get_event_loop()
        kind = json.loads(msg).get('kind')
        for p in self.pages:
            if p is source_page:
                continue
            if kind == 'pres' and random.random() < self.drop:
                self.dropped += 1
                continue
            self.count += 1
            self.queues[p].put_nowait((loop.time() + self.latency, msg))

    async def pump(self, page, q):
        loop = asyncio.get_event_loop()
        while True:
            t, msg = await q.get()
            d = t - loop.time()
            if d > 0:
                await asyncio.sleep(d)
            try:
                await page.evaluate('m => window.__mockIn && window.__mockIn(m)', msg)
            except Exception:
                pass

    def stop(self):
        for t in self.tasks:
            t.cancel()


async def crew_pages(p, relay, n=2, w=960, h=540, quality='low', extra_init='', mobile=()):
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    pages, logs = [], []
    THREE_JS = THREE
    for i in range(n):
        ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, is_mobile=True, has_touch=True) if i in mobile else await b.new_context(viewport={'width': w, 'height': h})
        page = await ctx.new_page()
        lg = []
        page.on('console', lambda m, lg=lg: lg.append(f'[{m.type}] {m.text}'))
        page.on('pageerror', lambda e, lg=lg: lg.append(f'[pageerror] {e}'))

        async def three(route):
            await route.fulfill(status=200, body=THREE_JS, headers={'Content-Type': 'text/javascript', 'Access-Control-Allow-Origin': '*'})
        await page.route('https://cdn.jsdelivr.net/**', three)
        await page.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, body='', headers={'Content-Type': 'text/css'}))
        await page.route('https://fonts.gstatic.com/**', lambda r: r.abort())
        await page.expose_binding('__mockOut', lambda src, msg, page=page: relay.out(page, msg))
        await page.add_init_script("localStorage.clear(); localStorage.setItem('brinebound-settings', JSON.stringify({quality: '%s'}));" % quality)
        await page.add_init_script(MOCK + extra_init)
        relay.add(page)
        pages.append(page)
        logs.append(lg)
    return b, pages, logs


async def start_voyage(page, name):
    await page.goto('http://127.0.0.1:8765/brinebound.html')
    await page.wait_for_function('window.__brinebound && window.__brinebound.state === "title"', timeout=90000)
    await page.click('#bStart', timeout=180000)
    await page.wait_for_timeout(300)
    await page.evaluate('(n) => { const g = window.__brinebound; g.look.name = n; g.applyLook("all"); }', name)
    await page.click('#sheet button:has-text("Set sail")', timeout=180000)
    await page.wait_for_function('window.__brinebound.state === "play"', timeout=90000)
    await page.evaluate('() => { const g = window.__brinebound; g.ui.toastsEl.innerHTML = ""; }')


def errors(lg):
    return [l for l in lg if 'pageerror' in l or '[error]' in l]


async def render(page, on):
    await page.evaluate("""(on) => { const g = window.__brinebound; if (!g._render) g._render = g.renderer.render.bind(g.renderer);
      g.renderer.render = on ? g._render : () => {}; }""", on)


async def snap(page, name):
    await render(page, True)
    await page.wait_for_timeout(1200)
    await shot(page, name)
    await render(page, False)
