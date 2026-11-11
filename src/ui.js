import { W, D, WS, SEA, B, BLOCKS, ITEMS, T, VERSION } from './config.js';
import { hash3 } from './noise.js';
import { cubeIconCanvas, tileCanvas } from './textures.js';
import { portrait } from './character.js';
import { EMOTES } from './player.js';

const $ = (id) => document.getElementById(id);

const PIX = {
  cutlass: { pal: { '#': '#e6ebec', '=': '#98a3a7', o: '#d6aa4f', h: '#5a3a22' }, rows: ['................', '.............##.', '............#=#.', '...........#=#..', '..........#=#...', '.........#=#....', '........#=#.....', '.......#=#......', '......#=#.......', '..o..#=#........', '..oo#=#.........', '...oo#..........', '..hhoo..........', '.hh..o..........', 'hh..............', 'h...............'] },
  hook: { pal: { i: '#3a3d40', I: '#6a7074', r: '#8a6a44', R: '#b08a5a' }, rows: ['................', '..rRr...........', '.rR.Rr..........', '.r...r..........', '.rR.Rr..........', '..rRri..........', '.....iI.........', '......iI........', '.......iI.......', '..i.....iI...i..', '..Ii.....iI..Ii.', '...Ii....iI.Ii..', '....IiiiiiIiI...', '......IiiiI.....', '................', '................'] },
  hammer: { pal: { h: '#7a5232', H: '#5a3a22', m: '#8d9296', M: '#5d6266' }, rows: ['................', '.....mmmmmmm....', '....mMMMMMMMm...', '....mMMMMMMMmmm.', '.....mmmmmmmMMm.', '.........hH..mm.', '........hH......', '.......hH.......', '......hH........', '.....hH.........', '....hH..........', '...hH...........', '..hH............', '.hH.............', '.H..............', '................'] },
  pick: { pal: { s: '#a9aeb2', S: '#7d8286', h: '#7a5232', H: '#5a3a22' }, rows: ['................', '...sssssss......', '..sSSSSSSSs.....', '.sS......hSs....', '.s......h..Ss...', '.......h....s...', '......h.........', '.....h..........', '....H...........', '...h............', '..h.............', '.H..............', 'h...............', '................', '................', '................'] },
  coconut: { pal: { b: '#3f2a17', B: '#6d4a2a', d: '#4b321b', l: '#8f6a43' }, rows: ['................', '................', '.....bbbbbb.....', '....bBlBBBBb....', '...bBllBdBBBb...', '..bBBlBBBBBdBb..', '..bBBBBBdBBBBb..', '..bBdBBBBBBBBb..', '..bBBBBBBBdBBb..', '..bBBBdBBBBBBb..', '..bBBBBBBBBdBb..', '...bBBBdBBBBb...', '....bBBBBBBb....', '.....bbbbbb.....', '................', '................'] },
  grog: { pal: { w: '#f4efe2', W: '#e2d8c2', b: '#4b321b', A: '#c98a2e', a: '#a96c1e' }, rows: ['................', '...wWwwWwwW.....', '..wwwWwwwWww....', '..bAAAAAAAAb....', '..bAaAAAAAAbbb..', '..bAAAAAaAAb.b..', '..bbbbbbbbbb.b..', '..bAAAAAAAAb.b..', '..bAAaAAAAAbbb..', '..bAAAAAAaAb....', '..bbbbbbbbbb....', '..bAAAAAAAAb....', '..bAAAaAAAAb....', '..bbbbbbbbbb....', '................', '................'] },
  ball: { pal: { k: '#141516', K: '#2c2e30', h: '#6c7074' }, rows: ['................', '................', '.....kkkkkk.....', '....kKKKKKKk....', '...kKhhKKKKKk...', '..kKKhKKKKKKKk..', '..kKKKKKKKKKKk..', '..kKKKKKKKKKKk..', '..kKKKKKKKKKKk..', '..kKKKKKKKKKKk..', '..kKKKKKKKKKKk..', '...kKKKKKKKKk...', '....kKKKKKKk....', '.....kkkkkk.....', '................', '................'] },
  bone: { pal: { b: '#efe7d3', d: '#cfc4a8' }, rows: ['................', '................', '..bb........bb..', '.bbbb......bbbb.', '.bbbbb....bbbbb.', '..bbbbbbbbbbbb..', '....bbbbbbbb....', '.....bbbbbb.....', '.....dddddd.....', '....dddddddd....', '..dddddddddddd..', '.ddddd....ddddd.', '.dddd......dddd.', '..dd........dd..', '................', '................'] },
  oil: { pal: { w: '#9a6a3a', W: '#7a5028', o: '#e2c065', k: '#3a2a1c' }, rows: ['................', '..wwwwwwwwwwww..', '..wWWWWWWWWWWw..', '..wWkkkkkkkkWw..', '..wWkoooooookWw.', '..wWkoooooookWw.', '..wWkkkkkkkkWw..', '..wWWWWWWWWWWw..', '..wwwwwwwwwwww..', '..wWWWWWWWWWWw..', '..wWWWWWWWWWWw..', '..wwwwwwwwwwww..', '................', '................', '................', '................'] },
  rum: { pal: { w: '#8a5a30', W: '#6e4524', m: '#2a2b2d' }, rows: ['................', '....wwwwwwww....', '...wWWWWWWWWw...', '..mmmmmmmmmmmm..', '..wWWWWWWWWWWw..', '..wWWWWWWWWWWw..', '..wWWWWWWWWWWw..', '..mmmmmmmmmmmm..', '..wWWWWWWWWWWw..', '..wWWWWWWWWWWw..', '..wWWWWWWWWWWw..', '..mmmmmmmmmmmm..', '...wWWWWWWWWw...', '....wwwwwwww....', '................', '................'] },
  candles: { pal: { c: '#efe7d3', f: '#ffcc55', b: '#7a5028' }, rows: ['................', '...f...f...f....', '...c...c...c....', '...c...c...c....', '..bbbbbbbbbbbb..', '..b..........b..', '..bccccccccccb..', '..bccccccccccb..', '..bccccccccccb..', '..bbbbbbbbbbbb..', '................', '................', '................', '................', '................', '................'] },
  skull: { pal: { b: '#ece4d0', k: '#1d1b1a', r: '#8a1f1a' }, rows: ['................', '....bbbbbbbb....', '...bbbbbbbbbb...', '..bbbbbbbbbbbb..', '..bbkkbbbbkkbb..', '..bbkkbbbbkkbb..', '..bbbbbkkbbbbb..', '...bbbbbbbbbb...', '....bbkbkbbb....', '....bkbkbkbb....', '.....bbbbbb.....', '................', '..rrrrrrrrrrrr..', '................', '................', '................'] },
  page: { pal: { p: '#efe2c0', l: '#a89a7a', e: '#7a4a2a' }, rows: ['................', '...ppppppppp....', '...pllllllpppp..', '...ppppppppppp..', '...pllllllllpp..', '...ppppppppppp..', '...plllllllpp...', '...ppppppppppp..', '...pllllllllp...', '...pppppppppp...', '...plllllpppp...', '...ppppppppep...', '...pppppppee....', '................', '................', '................'] },
  heart: { pal: { g: '#2c4a3c', G: '#5fd1a8', w: '#c8ffe8' }, rows: ['................', '................', '...gg....gg.....', '..gGGg..gGGg....', '.gGwGGggGGGGg...', '.gGGGGGGGGGGg...', '.gGGGGGGGGGGg...', '..gGGGGGGGGg....', '...gGGGGGGg.....', '....gGGGGg......', '.....gGGg.......', '......gg........', '................', '................', '................', '................'] },
  pearl: { pal: { p: '#f4f0ea', s: '#c9c2d8', w: '#ffffff' }, rows: ['................', '................', '................', '.....pppppp.....', '....pwwppppp....', '...pwwpppppps...', '...pwppppppps...', '...ppppppppps...', '...ppppppppss...', '....ppppppss....', '.....pssssss....', '................', '................', '................', '................', '................'] },
};
PIX.meat = { pal: { m: '#a8432e', M: '#7e2e1e', f: '#e9c9a8', b: '#efe7d3' }, rows: ['................', '................', '.....mmmmm......', '....mMmmmmm.....', '...mmMMmmfmm....', '...mmmmmmmmm....', '...mMmmmfmmm....', '....mmmmmmmbb...', '.....mmmmm.bbb..', '...........bbb..', '............b...', '................', '................', '................', '................', '................'] };
PIX.crab = { pal: { r: '#d0482a', R: '#a8341e', k: '#2a1a10', o: '#e8703e' }, rows: ['................', '................', '..oo........oo..', '.oooo......oooo.', '..oo..k..k..oo..', '...o..k..k..o...', '....rrrrrrrr....', '...rrRrrrrRrr...', '...rrrrrrrrrr...', '....rrrrrrrr....', '...R.R.RR.R.R...', '..R..R....R..R..', '................', '................', '................', '................'] };
for (const p of ['page1', 'page2', 'page3']) PIX[p] = PIX.page;
PIX.goblet = { pal: { s: '#d9dde0', S: '#9aa2a8', g: '#d6aa4f' }, rows: ['................', '................', '....ssssssss....', '....sSSSSSSs....', '....sssssss s...'.replace(' ', 's'), '.....ssssss.....', '......ssss......', '.......ss.......', '.......SS.......', '.......ss.......', '......ssss......', '.....gggggg.....', '.....SSSSSS.....', '................', '................', '................'] };
PIX.pearls = { pal: { p: '#f4f0ea', s: '#b9b2c8', c: '#7a5a3a' }, rows: ['................', '................', '...pp.....pp....', '..pssp...pssp...', '..pp.pp.pp.pp...', '.....pp.pp......', '.pp...ppp...pp..', 'pssp..cc...pssp.', '.pp...pp....pp..', '......pssp......', '.......pp.......', '................', '................', '................', '................', '................'] };
PIX.ruby = { pal: { r: '#c8283a', R: '#8a1424', w: '#ffb0b8' }, rows: ['................', '................', '................', '.....rrrrrr.....', '....rwwrrrrr....', '...rwrrrrrrrr...', '...rrrrrrrrrR...', '....rrrrrrrR....', '.....rrrrrR.....', '......rrrR......', '.......rR.......', '................', '................', '................', '................', '................'] };
PIX.idol = { pal: { g: '#e2b64a', G: '#a87d22', k: '#3a2a10', w: '#fff1b8' }, rows: ['................', '.....gggggg.....', '....gwgggggG....', '....gkgggkgG....', '....gggggggG....', '....ggkkkggG....', '.....gggggG.....', '...ggggggggGG...', '..gg.gggggG.GG..', '.....gggggG.....', '.....gg..gG.....', '....GGG..GGG....', '...GGGGGGGGGG...', '................', '................', '................'] };
const GUNPAL = { i: '#8d9296', I: '#4a4e52', w: '#8a5a32', W: '#56351c', b: '#d6aa4f' };
PIX.pistol = { pal: GUNPAL, rows: ['................', '................', '................', '................', '.........I......', 'biiiiiiiiwwww...', 'bIIIIIIIIwwwwW..', '.......wwwwwwWW.', '........b.wwwWW.', '.........bbwwwW.', '...........wwwW.', '...........wwwWW', '............bbbb', '................', '................', '................'] };
PIX.blunderbuss = { pal: GUNPAL, rows: ['................', '................', '................', 'bb..............', 'bbb.............', 'bbbbbbbbbbI.....', 'bbbbbbbbbbwwwww.', 'bbb....wwwwwwwww', 'bb......b.wwWWWW', '.........b...WWW', '..............WW', '................', '................', '................', '................', '................'] };
PIX.musket = { pal: GUNPAL, rows: ['................', '................', '................', '................', '................', 'b.........I.....', 'iiiiiiiiiiiwww..', 'IIIIIIIIIIwwwwww', '.....wwwwwwwwWWW', '..........b.wWWW', '...........b..WW', '..............WW', '................', '................', '................', '................'] };
PIX.shot = { pal: { g: '#9aa0a6', d: '#4a4e52', w: '#d8dde0' }, rows: ['................', '................', '................', '................', '......dd........', '.....dwgd.......', '.....dggd..dd...', '......dd..dwgd..', '...dd.....dggd..', '..dwgd.dd..dd...', '..dggd.dwgd.....', '...dd..dggd.....', '........dd......', '................', '................', '................'] };
function pixIcon(name) {
  const def = PIX[name];
  const c = document.createElement('canvas'); c.width = c.height = 16;
  if (!def) return c;
  const x = c.getContext('2d');
  def.rows.forEach((row, py) => { for (let px = 0; px < 16; px++) { const k = row[px]; if (k !== '.' && def.pal[k]) { x.fillStyle = def.pal[k]; x.fillRect(px, py, 1, 1); } } });
  return c;
}
const iconCache = {};
export function itemIcon(item) {
  if (!iconCache[item]) {
    const d = ITEMS[item];
    if (d && d.block) { const bd = BLOCKS[d.block]; iconCache[item] = cubeIconCanvas(bd.tex[0], bd.front || bd.tex[1], 32); }
    else iconCache[item] = pixIcon(item);
  }
  const src = iconCache[item];
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  c.className = 'icon'; c.setAttribute('aria-hidden', 'true');
  return c;
}

const SVG = {
  x: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"/></svg>',
  npc: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="3.6" r="2.3" fill="currentColor"/><path d="M1.6 11.5c.3-3.2 2.1-5 4.4-5s4.1 1.8 4.4 5z" fill="currentColor"/></svg>',
  skull: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 5.5a4 4 0 0 1 8 0v2H8.5v2h-5v-2H2z" fill="currentColor"/><rect x="3.6" y="4.6" width="1.6" height="1.6" fill="#0f1b20"/><rect x="6.8" y="4.6" width="1.6" height="1.6" fill="#0f1b20"/></svg>',
  enemy: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 5.5a4 4 0 0 1 8 0v2H8.5v2h-5v-2H2z" fill="currentColor"/><rect x="3.6" y="4.6" width="1.6" height="1.6" fill="#0f1b20"/><rect x="6.8" y="4.6" width="1.6" height="1.6" fill="#0f1b20"/></svg>',
  ship: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 7.5h9l-1.6 2.5H3.1z M5.6 1.5v6 M6.2 2.2l3.2 4.3H6.2z" fill="currentColor" stroke="currentColor" stroke-width=".6"/></svg>',
  bottle: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M5 1h2v2.2l1.5 1.6V11h-5V4.8L5 3.2z" fill="currentColor"/></svg>',
  vault: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="3.5" width="9" height="7" fill="currentColor"/><rect x="1.5" y="2" width="9" height="2.5" fill="currentColor" opacity=".7"/><rect x="5.2" y="5.5" width="1.6" height="2" fill="#0f1b20"/></svg>',
  deep: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 6m-1 0a1 1 0 1 1 2 0a2.2 2.2 0 1 1-4.4 0a3.4 3.4 0 1 1 6.8 0a4.6 4.6 0 1 1-9.2 0" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>',
  chart: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 2.5l3.3-1 3.4 1 3.3-1v8.5l-3.3 1-3.4-1-3.3 1z" fill="currentColor"/></svg>',
  mate: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="3.4" r="2.3" fill="currentColor"/><path d="M1.6 11.5c.3-3.2 2.1-5 4.4-5s4.1 1.8 4.4 5z" fill="currentColor"/><path d="M3.4 2.2h5.2l-.6-1.4H4z" fill="#0f1b20"/></svg>',
  haven: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v8.5 M3.5 4h5 M1.8 7.2c.6 2.4 2.4 3.3 4.2 3.3s3.6-.9 4.2-3.3" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="6" cy="1.8" r="1.1" fill="currentColor"/></svg>',
};
export { SVG };

export class UI {
  constructor(game) {
    this.g = game;
    this.cache = {};
    this.toastsEl = $('toasts');
    this.buildCompass();
    this.bind();
    this.joyBase = $('joy'); this.joyKnob = $('joyKnob');
    this.mapBase = null;
    this.marks = [];
    this.fpsT = 0; this.frames = 0;
  }
  txt(key, el, v) { if (this.cache[key] !== v) { this.cache[key] = v; el.textContent = v; } }
  css(key, el, prop, v) { if (this.cache[key] !== v) { this.cache[key] = v; el.style.setProperty(prop, v); } }
  hidden(key, el, h) { if (this.cache[key] !== h) { this.cache[key] = h; el.classList.toggle('hidden', h); } }

  bind() {
    const G = this.g;
    const tap = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); fn(); });
    tap('bStart', () => G.openSheet('captain', { fresh: true }));
    tap('bContinue', () => G.continueLatest());
    tap('bLoad', () => G.openSheet('saves', { mode: 'load', fromTitle: true }));
    tap('bTitleSettings', () => G.openSheet('settings', { fromTitle: true }));
    tap('bCrew', () => G.sailWithFriends());
    tap('tChat', () => this.openChat());
    const inp = $('chatInput');
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); const t = inp.value; this.closeChat(); G.net.sendChat(t); }
      else if (e.key === 'Escape') { e.preventDefault(); this.closeChat(); }
    });
    inp.addEventListener('blur', () => { if (this.chatting) this.closeChat(); });
    tap('bMap', () => G.openSheet('map'));
    tap('bQuests', () => G.openSheet('quests'));
    tap('bBag', () => G.openSheet('bag'));
    tap('bMenu', () => G.openSheet('menu'));
    tap('tView', () => G.toggleView());
    tap('guideNext', () => G.advanceTutorial());
    tap('guideSkip', () => G.skipTutorial());
    const hold = (id, action) => {
      const el = $(id);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); G.input.press(action); G.input.hold(action, true); el.classList.add('down'); });
      const up = () => { G.input.hold(action, false); el.classList.remove('down'); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    hold('tHit', 'hit'); hold('tPlace', 'place'); hold('tJump', 'jump'); hold('tUse', 'use'); hold('tCrouch', 'crouch');
    tap('tEmote', () => (G.wheel ? G.closeWheel() : G.openWheel()));
    // the emote wheel: eight buttons in a ring; tap one, or tap outside to close
    const ring = $('emoteRing');
    this.emoBtns = EMOTES.map(([id, name], i) => {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / EMOTES.length;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'emo';
      b.style.transform = `translate(${(Math.cos(a) * 112).toFixed(1)}px, ${(Math.sin(a) * 112).toFixed(1)}px)`;
      const k = document.createElement('kbd'); k.textContent = String(i + 1);
      b.append(k, name);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); G.pickEmote(i); });
      b.addEventListener('pointerenter', () => this.emoteSel(i));
      ring.appendChild(b);
      return b;
    });
    $('emotes').addEventListener('pointerdown', (e) => { if (e.target === $('emotes')) { e.preventDefault(); G.closeWheel(); } });
    hold('tPort', 'port'); hold('tStar', 'star'); hold('tRepair', 'repair');
  }

  buildHotbar() {
    const G = this.g, bar = $('hotbar');
    bar.innerHTML = '';
    this.slots = G.hotbar.map((item, i) => {
      const b = document.createElement('button');
      b.className = 'slot'; b.type = 'button';
      b.setAttribute('aria-label', item ? ITEMS[item].name : 'Empty slot');
      if (item) b.appendChild(itemIcon(item));
      const n = document.createElement('span'); n.className = 'count'; b.appendChild(n);
      const k = document.createElement('span'); k.className = 'key'; k.textContent = String(i + 1); b.appendChild(k);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); G.selectSlot(i); });
      bar.appendChild(b);
      return { b, n, item };
    });
    this.cache = Object.fromEntries(Object.entries(this.cache).filter(([k]) => !k.startsWith('slot')));
  }
  setCaptain(look) {
    $('capName').textContent = look.name;
    const c = $('hudPortrait'), x = c.getContext('2d');
    x.imageSmoothingEnabled = false; x.clearRect(0, 0, 32, 32); x.drawImage(portrait(look, 32), 0, 0);
  }

  buildCompass() {
    const inner = $('cmpInner');
    this.cmpTicks = [];
    ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].forEach((n, i) => {
      const s = document.createElement('span'); s.className = 'cmp-tick' + (n.length === 1 ? ' major' : ''); s.textContent = n;
      inner.appendChild(s); this.cmpTicks.push({ el: s, bearing: (i * Math.PI) / 4 });
    });
    this.cmpPool = [];
  }
  placeMark(el, bearing, camBearing, show) {
    let rel = bearing - camBearing;
    while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
    const HALF = Math.PI * 0.55;
    const vis = show && Math.abs(rel) < HALF;
    el.style.display = vis ? '' : 'none';
    if (vis) el.style.left = (50 + (rel / HALF) * 50).toFixed(2) + '%';
  }

  update(dt) {
    const G = this.g, P = G.player;
    this.frames++; this.fpsT += dt;
    if (this.fpsT > 0.5) { if (G.settings.get('fps')) $('fps').textContent = Math.round(this.frames / this.fpsT) + ' fps'; this.frames = 0; this.fpsT = 0; }
    this.hidden('fps', $('fps'), !G.settings.get('fps'));
    this.css('hp', $('mHpFill'), 'width', ((P.hp / P.maxHp) * 100).toFixed(0) + '%');
    this.txt('hpN', $('mHpNum'), String(Math.ceil(P.hp)));
    this.css('food', $('mFoodFill'), 'width', P.hunger.toFixed(0) + '%');
    this.txt('foodN', $('mFoodNum'), String(Math.ceil(P.hunger)));
    $('mHp').classList.toggle('low', P.hp < P.maxHp * 0.3);
    $('mFood').classList.toggle('low', P.hunger < 20);
    this.txt('goldC', $('goldC'), String(G.gold));
    this.txt('goldB', $('goldB'), String(G.banked));
    const lv = G.lootValue(G.inv);
    this.hidden('lootC', $('lootC'), lv <= 0);
    if (lv > 0) this.txt('lootV', $('lootV'), String(lv));
    this.txt('day', $('dayN'), `Day ${G.sky.day}${G.sky.isNight ? ', night' : ''}${G.weather.storm > 0.5 ? ', storm' : ''}`);
    G.hotbar.forEach((item, i) => {
      const s = this.slots[i];
      if (!s) return;
      const tool = item && ITEMS[item].tool;
      this.txt('slotn' + i, s.n, !item ? '' : ITEMS[item].gun ? String(G.inv.shot || 0) : tool ? '' : String(G.inv[item] || 0));
      const sel = i === G.sel;
      if (this.cache['slots' + i] !== sel) { this.cache['slots' + i] = sel; s.b.classList.toggle('sel', sel); }
      const empty = !item || ((!tool || ITEMS[item].gun) && !(G.inv[item] > 0));
      if (this.cache['slote' + i] !== empty) { this.cache['slote' + i] = empty; s.b.classList.toggle('empty', empty); }
    });
    // ship panel
    const s = G.sloop, aboard = P.mode === 'deck' || P.mode === 'helm';
    this.hidden('shipP', $('shipPanel'), !(aboard && s));
    if (aboard && s) {
      this.css('hull', $('mHullFill'), 'width', ((s.hp / s.maxHp) * 100).toFixed(0) + '%');
      this.txt('hullN', $('mHullNum'), String(Math.ceil(s.hp)));
      $('mHull').classList.toggle('low', s.hp < s.maxHp * 0.35);
      this.txt('sail', $('sSail'), Math.round(s.sailLvl * 100) + '%');
      this.txt('spd', $('sSpeed'), (Math.abs(s.speed) * 1.6).toFixed(1) + ' kn');
      this.txt('balls', $('sBalls'), String(G.inv.ball || 0));
      const hc = Math.cos(s.heading), hs = Math.sin(s.heading), wx = Math.cos(G.wind.angle), wz = Math.sin(G.wind.angle);
      const deg = (Math.atan2(wx * hc - wz * hs, -(wx * hs + wz * hc)) * 180) / Math.PI;
      this.css('wind', $('sWind'), 'transform', `rotate(${deg.toFixed(0)}deg)`);
      this.txt('windT', $('sWindTxt'), s.wf > 0.85 ? 'Fair' : s.wf > 0.6 ? 'Beam' : 'Head');
      this.txt('shipKeys', $('shipKeys'), G.input.gamepadId !== null
        ? 'Left stick: sails/steer · L2/R2: fire · □: leave helm'
        : 'W/S sails · A/D steer · Q/E fire · R repair · F leave helm');
      this.hidden('shipKeys', $('shipKeys'), P.mode !== 'helm' || G.isTouch);
    }
    // enemy bar: nearest hollow ship, or the kraken
    let ename = null, efrac = 0;
    const k = G.kraken;
    if (k && !k.dead) {
      ename = 'The Deep One';
      if (k.state === 'head' || k.state === 'dying') efrac = Math.max(0, k.headHp / k.headMax);
      else { const al = k.tentacles.filter((t) => t.alive); efrac = al.length / 6; }
    } else {
      let best = null;
      for (const h of G.hollows) { if (h.sinking) continue; const d = Math.hypot(h.pos.x - P.pos.x, h.pos.z - P.pos.z); if (d < 90 && (!best || d < best.d)) best = { h, d }; }
      if (best) { ename = best.h.kind !== 'hollow' ? `${best.h.design.label} · ${best.h.name}` : best.h.variant === 'flagship' ? 'The Hollow Flagship' : 'The Hollow Wake'; efrac = best.h.hp / best.h.maxHp; }
    }
    this.hidden('enemyP', $('enemyPanel'), !ename);
    if (ename) { this.txt('ename', $('eName'), ename); this.css('ehp', $('eHpFill'), 'width', (efrac * 100).toFixed(0) + '%'); }
    // crew roster
    const net = G.net, crew = net.role ? net.roster() : [];
    this.hidden('crewP', $('crewPanel'), !crew.length);
    this.hidden('tChat', $('tChat'), !net.role || !G.isTouch);
    if (crew.length) {
      const key = crew.map((c) => `${c.name}|${c.host ? 1 : 0}|${c.alive ? Math.ceil((c.hp / c.maxHp) * 10) : -1}`).join(';');
      if (this.cache.crew !== key) {
        this.cache.crew = key;
        $('crewPanel').replaceChildren(...crew.map((c) => {
          const row = document.createElement('div'); row.className = 'mate' + (c.alive ? '' : ' down');
          const n = document.createElement('span'); n.className = 'mn'; n.textContent = (c.host ? '⚓ ' : '') + c.name;
          const t = document.createElement('span'); t.className = 'mtrack'; const f = document.createElement('i'); f.style.width = (c.alive ? Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100)) : 0).toFixed(0) + '%'; t.append(f);
          row.append(n, t);
          return row;
        }));
      }
    }
    if (this.chatAt && performance.now() - this.chatAt > 14000 && !this.chatting) { this.chatAt = 0; $('chatLog').classList.add('hidden'); }
    // compass
    const camB = G.cameraBearing();
    for (const m of this.cmpTicks) this.placeMark(m.el, m.bearing, camB, true);
    const marks = G.quests.markers();
    if (G.gold > 0 && !marks.some((m) => m.icon === 'npc')) { const n = G.npcs.get('mags'); if (n) marks.push({ x: n.site.x, z: n.site.z, icon: 'haven' }); }
    if (s && !s.sinking && P.mode === 'foot' && Math.hypot(s.pos.x - P.pos.x, s.pos.z - P.pos.z) > 12) marks.push({ x: s.pos.x, z: s.pos.z, icon: 'ship' });
    for (const h of G.hollows) if (!h.sinking && Math.hypot(h.pos.x - P.pos.x, h.pos.z - P.pos.z) < 120) marks.push({ x: h.pos.x, z: h.pos.z, icon: G.fleet.hostile(h) ? 'enemy' : 'ship' });
    for (const b of G.props.bottles) if (Math.hypot(b.x - P.pos.x, b.z - P.pos.z) < 70) marks.push({ x: b.x, z: b.z, icon: 'bottle' });
    for (const c of crew) if (c.alive && Math.hypot(c.x - P.pos.x, c.z - P.pos.z) > 8) marks.push({ x: c.x, z: c.z, icon: 'mate' });
    while (this.cmpPool.length < marks.length) { const sp = document.createElement('span'); $('cmpInner').appendChild(sp); this.cmpPool.push(sp); }
    this.cmpPool.forEach((sp, i) => {
      const m = marks[i];
      if (!m) { sp.style.display = 'none'; return; }
      const key = m.icon + (m.tracked ? 't' : '');
      if (sp.dataset.k !== key) { sp.dataset.k = key; sp.className = `cmp-mark ic-${m.icon}${m.tracked ? ' tracked' : ''}`; sp.innerHTML = SVG[m.icon] || SVG.x; }
      this.placeMark(sp, Math.atan2(m.x - P.pos.x, -(m.z - P.pos.z)), camB, true);
    });
    // quest tracker
    const tr = G.quests.tracked_();
    this.txt('goalT', $('goalTitle'), tr.title);
    this.txt('goal', $('goalText'), tr.text);
    const mk = tr.marker;
    this.txt('goalD', $('goalDist'), mk ? `${Math.round(Math.hypot(mk.x - P.pos.x, mk.z - P.pos.z))} m` : '');
    // prompt + touch use button
    const it = G.interaction;
    const promptText = G.needsClick ? 'Click the game to look around' : it && P.mode !== 'helm' ? it.label : '';
    const usingGamepad = G.input.gamepadId !== null;
    this.hidden('prompt', $('prompt'), !promptText || (G.isTouch && !usingGamepad));
    if (promptText && (!G.isTouch || usingGamepad)) {
      const key = G.needsClick ? '' : G.input.promptControl('use');
      if (this.cache.prompt !== key + promptText) {
        this.cache.prompt = key + promptText;
        const el = $('prompt'); el.replaceChildren();
        if (key) { const k = document.createElement('kbd'); k.textContent = key; el.append(k, ' '); }
        el.append(promptText);
      }
    }
    if (G.isTouch) {
      const helm = P.mode === 'helm';
      this.hidden('tUse', $('tUse'), !it);
      if (it) this.txt('tUseT', $('tUse'), `${usingGamepad ? G.input.promptControl('use') : 'Tap'} ${it.short || it.label}`);
      this.hidden('tPort', $('tPort'), !helm);
      this.hidden('tStar', $('tStar'), !helm);
      this.hidden('tHit', $('tHit'), helm);
      this.hidden('tPlace', $('tPlace'), helm);
      this.hidden('tJump', $('tJump'), helm);
      this.hidden('tCrouch', $('tCrouch'), helm || P.inWater);
      this.hidden('tEmote', $('tEmote'), helm || !P.alive);
      $('tCrouch').classList.toggle('on', !!P.crouch);
      this.txt('tCrouchT', $('tCrouch'), P.crouch ? 'Stand' : 'Crouch');
      this.hidden('tRepair', $('tRepair'), !(aboard && s && s.hp < s.maxHp && (G.inv.plank || 0) > 0));
      const item = G.hotbar[G.sel], food = item && ITEMS[item].food;
      this.txt('tPlaceT', $('tPlace'), food ? (item === 'grog' ? 'Drink' : 'Eat') : 'Place');
      this.txt('tViewT', $('tView'), G.camMode === 'third' ? '1st' : '3rd');
    }
    const step = G.hints.tutorialStep;
    const guideOn = G.state === 'play' && P.alive && Number.isInteger(step) && step >= 0 && step < 6;
    this.hidden('guide', $('guide'), !guideOn);
    if (guideOn) {
      const use = G.input.promptControl('use'), attack = G.input.promptControl('attack');
      const controls = G.input.gamepadId !== null ? { use: `${use} Use`, attack: attack }
        : G.isTouch ? { use: 'Tap Use', attack: 'Hit' }
          : { use: `${use} Use`, attack: 'Left click' };
      const guide = [
        ['Movement & looking', G.input.gamepadId !== null ? 'Use the left stick to move and the right stick to look around.' : G.isTouch ? 'Move with the left joystick; drag the right side to look around.' : 'Move with W, A, S, D; move the mouse to look around.'],
        ['Gather & interact', `Choose a tool on the hotbar. ${controls.attack} to swing; ${controls.use} to talk, board, or use what your prompt names.`],
        ['Set sail', `Walk up the pier and ${controls.use} at your sloop’s wheel. At the helm, move forward/back to trim sail and left/right to steer.`],
        ['Fight at sea', `At a cannon, look to aim and ${controls.attack} to fire. From the helm, use the port and starboard fire controls; watch your shot supply.`],
        ['Keep your voyage', 'Open Menu, choose Save, then save to a numbered slot. Your autosave also updates as you play.'],
        ['The sea is yours', 'Follow the compass and your chosen quest, gather what you need, and return to Brine Haven when you’re ready.'],
      ];
      const [title, body] = guide[step];
      this.txt('guideStep', $('guideStep'), `FIRST VOYAGE · ${step + 1} OF 6`);
      this.txt('guideTitle', $('guideTitle'), title);
      this.txt('guideText', $('guideText'), body);
      this.txt('guideNextText', $('guideNext'), step === 5 ? 'Finish' : 'Next');
      this.txt('guideControls', $('guideControls'), G.input.gamepadId !== null ? 'D-pad → next · D-pad ↓ skip' : G.isTouch ? 'Tap Next to continue' : 'Continue with Next');
    }
    $('bQuests').classList.toggle('alert', G.quests.active.some((q) => q.state === 'ready'));
  }

  setMineProgress(p) {
    const r = $('ring');
    const v = p > 0.02 ? (88 * (1 - Math.min(1, p))).toFixed(1) : '88';
    if (this.cache.ring !== v) { this.cache.ring = v; r.style.strokeDashoffset = v; }
  }
  setCrosshair(show) { this.hidden('xhair', $('crosshair'), !show); }
  showEmotes(on) {
    $('emotes').classList.toggle('hidden', !on);
    if (on) { this.emoteSel(-1); $('emoteHint').textContent = this.g.isTouch ? 'Tap one' : this.g.input.locked ? 'Move the mouse, click, or press 1 to 8' : 'Click one, or press 1 to 8'; }
  }
  emoteSel(i) {
    if (this.cache.emo === i) return;
    this.cache.emo = i;
    this.emoBtns.forEach((b, k) => b.classList.toggle('on', k === i));
    $('emoteName').textContent = i >= 0 ? EMOTES[i][1] : 'Emotes';
  }
  // a line under the title's buttons: what's happening, or what went wrong
  titleNote(text, bad = false) {
    const el = $('titleStatus');
    el.textContent = text;
    el.classList.toggle('bad', !!bad);
  }
  // the "I'm stuck" countdown: t seconds left, or -1 to hide
  stuck(t) {
    const el = $('stuckNote');
    if (t < 0) { el.classList.add('hidden'); this.cache.stuck = null; return; }
    el.classList.remove('hidden');
    const n = Math.max(0, Math.ceil(t));
    if (this.cache.stuck !== n) { this.cache.stuck = n; $('stuckText').textContent = n > 0 ? `Hold still… ${n}` : 'Up you come'; }
    $('stuckFill').style.width = `${Math.min(100, (1 - t / 7) * 100).toFixed(1)}%`;
  }
  pickup(text) {
    const el = document.createElement('div');
    el.className = 'pick'; el.textContent = text;
    const box = $('pickup');
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => el.remove(), 1800);
  }
  toast(head, line, tone = '') {
    // toasts live in the HUD, which the title screen hides: say it there instead
    if (this.g.state === 'title' || this.g.state === 'loading') this.titleNote(`${head}. ${line || ''}`.trim(), tone === 'bad');
    const el = document.createElement('div');
    el.className = 'toast ' + tone;
    const h = document.createElement('strong'); h.textContent = head;
    const p = document.createElement('span'); p.textContent = line;
    el.append(h, p);
    this.toastsEl.appendChild(el);
    while (this.toastsEl.children.length > 2) this.toastsEl.removeChild(this.toastsEl.firstChild);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 600); }, tone === 'chapter' ? 6000 : 4400);
  }
  flashDamage() { const v = $('vignette'); v.classList.remove('hit'); void v.offsetWidth; v.classList.add('hit'); }
  flashScreen() { const v = $('flashScreen'); v.classList.remove('on'); void v.offsetWidth; v.classList.add('on'); }
  fade(on) { $('fade').classList.toggle('on', on); }
  showHud(on) {
    $('hud').classList.toggle('hidden', !on);
    $('touch').classList.toggle('hidden', !(on && this.g.isTouch));
    document.body.classList.toggle('touch', this.g.isTouch);
  }
  showTitle(on) { $('title').classList.toggle('hidden', !on); }
  // ---------------------------------------------------------------- crew: chat, joining note
  openChat() {
    const G = this.g;
    if (this.chatting || !G.net.role || G.state !== 'play') return;
    this.chatting = true;
    const I = G.input;
    I.keys.clear(); I.pressed.clear(); I.mouseL = false; I.btnHeld.clear();
    I.exitLock();
    const box = $('chatBox'), inp = $('chatInput');
    box.classList.remove('hidden'); inp.value = '';
    setTimeout(() => inp.focus(), 0);
  }
  closeChat() {
    if (!this.chatting) return;
    this.chatting = false;
    const inp = $('chatInput');
    $('chatBox').classList.add('hidden');
    inp.blur();
    if (this.g.state === 'play') this.g.input.requestLock();
  }
  showChat(list) {
    const log = $('chatLog');
    log.replaceChildren(...list.map((m) => {
      const row = document.createElement('div');
      row.className = 'cl' + (m.mine ? ' mine' : '');
      const b = document.createElement('b'); b.textContent = m.name + ':';
      row.append(b, ' ', m.t);
      return row;
    }));
    log.classList.toggle('hidden', !list.length);
    this.chatAt = performance.now();
  }
  showCrewButton(on) { $('bCrew').classList.toggle('hidden', !on); }
  netNote(text) {
    const el = $('netNote');
    el.classList.toggle('hidden', !text);
    if (text) el.textContent = text;
  }
  titleReady(latest) {
    $('titleEyebrow').textContent = `Prototype ${VERSION} · working title`;
    this.titleNote(latest ? `Last voyage: ${latest.doc.meta.name}, day ${latest.doc.meta.day}, ${latest.doc.meta.chapter}.` : 'The archipelago is charted.');
    $('bStart').disabled = false;
    $('bContinue').classList.toggle('hidden', !latest);
    $('bStart').classList.toggle('ghost', !!latest);
    this.showCrewButton(this.g.net.available);
    document.body.classList.toggle('touch', this.g.isTouch);
  }
  showJoy(x, y) { this.joyBase.style.display = 'block'; this.joyBase.style.left = x + 'px'; this.joyBase.style.top = y + 'px'; this.joyKnob.style.transform = 'translate(-50%,-50%)'; }
  moveJoy(dx, dy) { this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; }
  hideJoy() { this.joyBase.style.display = 'none'; }

  // ---------------------------------------------------------------- sea chart
  buildMapBase() {
    const w = this.g.world, disc = this.g.quests.discovered;
    const c = document.createElement('canvas'); c.width = W; c.height = D;
    const x = c.getContext('2d');
    const img = x.createImageData(W, D);
    const put = (i, r, g, b) => { img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255; };
    const tops = new Int16Array(W * D);
    for (let z = 0; z < D; z++) for (let xx = 0; xx < W; xx++) tops[xx + z * W] = w.topSolid(xx, z) + 1;
    for (let z = 0; z < D; z++) for (let xx = 0; xx < W; xx++) {
      const i = xx + z * W, s = tops[i];
      const grain = (hash3(xx, z, 3) - 0.5) * 10;
      const isl = w.islandOf[i];
      const known = isl < 0 || disc.includes(isl);
      if (s <= SEA) {
        const shallow = s >= SEA - 4;
        const base = shallow ? [196, 208, 190] : [214, 214, 192];
        put(i, base[0] + grain, base[1] + grain, base[2] + grain);
      } else if (!known) {
        put(i, 186 + grain, 178 + grain, 156 + grain);
      } else {
        const id = w.get(xx, s - 1, z);
        let col = [214, 190, 138];
        if (id === B.GRASS || id === B.LEAVES || id === B.FROND || id === B.LOG || id === B.PALM || id === B.COCONUT) col = [163, 158, 100];
        else if (id === B.JLEAVES || id === B.JLOG || id === B.BAMBOO || id === B.VINE) col = [128, 142, 92];
        else if (id === B.STONE || id === B.BRICK || id === B.MOSSBRICK) col = [156, 146, 128];
        else if (id === B.SLATE) col = [118, 112, 104];
        else if (id === B.BASALT || id === B.OBSIDIAN) col = [96, 92, 90];
        else if (id === B.ASH) col = [152, 148, 140];
        else if (id === B.MAGMA) col = [214, 112, 52];
        else if (id === B.BONE || id === B.WHITEBRICK) col = [236, 228, 206];
        else if (id === B.PLANK || id === B.CLOTH || id === B.WRECKWOOD || id === B.BARREL || id === B.CRATE) col = [150, 108, 66];
        const k = 1.05 - Math.min(0.35, (s - SEA) * 0.022);
        put(i, col[0] * k + grain, col[1] * k + grain, col[2] * k + grain);
      }
    }
    for (let z = 1; z < D - 1; z++) for (let xx = 1; xx < W - 1; xx++) {
      const i = xx + z * W;
      if (tops[i] > SEA && (tops[i - 1] <= SEA || tops[i + 1] <= SEA || tops[i - W] <= SEA || tops[i + W] <= SEA)) put(i, 75, 58, 40);
    }
    x.putImageData(img, 0, 0);
    this.mapBase = c;
  }
  drawMap(cv, noteEl) {
    const G = this.g, x = cv.getContext('2d');
    const S = cv.width / W, U = S * WS;   // S places things; U sizes marks and lettering, kept as they were before the world grew
    if (!this.mapBase) this.buildMapBase();
    x.imageSmoothingEnabled = false;
    x.fillStyle = '#d6d6c0'; x.fillRect(0, 0, cv.width, cv.height);
    x.drawImage(this.mapBase, 0, 0, cv.width, cv.height);
    x.strokeStyle = 'rgba(75,58,40,0.16)'; x.lineWidth = 1;
    for (let i = 1; i < 8; i++) { const p = Math.round((i * cv.width) / 8) + 0.5; x.beginPath(); x.moveTo(p, 0); x.lineTo(p, cv.height); x.moveTo(0, p); x.lineTo(cv.width, p); x.stroke(); }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    G.world.islands.forEach((o, i) => {
      const known = G.quests.discovered.includes(i);
      x.font = `italic ${Math.round(12 * U)}px "IM Fell English", Georgia, serif`;
      x.fillStyle = known ? '#3b2c1e' : 'rgba(59,44,30,0.55)';
      const label = known ? o.name : 'Uncharted';
      const tw = x.measureText(label).width;
      x.fillText(label, Math.min(cv.width - tw / 2 - 6, Math.max(tw / 2 + 6, o.x * S)), Math.max(14 * U, (o.z - o.r * 0.72 - 3) * S));
    });
    const glyph = (m, tracked) => {
      const cx = m.x * S, cz = m.z * S;
      if (m.r) { x.setLineDash([4 * U, 3 * U]); x.strokeStyle = '#b3402a'; x.lineWidth = 2 * U; x.beginPath(); x.arc(cx, cz, m.r * S, 0, Math.PI * 2); x.stroke(); x.setLineDash([]); return; }
      const r = (tracked ? 6.5 : 5) * S;
      x.lineWidth = 2.4 * U; x.lineCap = 'square';
      if (m.icon === 'x') { x.strokeStyle = '#b3402a'; x.beginPath(); x.moveTo(cx - r, cz - r); x.lineTo(cx + r, cz + r); x.moveTo(cx + r, cz - r); x.lineTo(cx - r, cz + r); x.stroke(); }
      else {
        x.fillStyle = { skull: '#3b2c1e', npc: '#8a6a24', vault: '#2e6a54', deep: '#6a3a8a', bottle: '#2e7a62', enemy: '#2e8a6e', ship: '#2f6f7e', chart: '#7a6a3a' }[m.icon] || '#3b2c1e';
        x.beginPath(); x.arc(cx, cz, r * 0.7, 0, Math.PI * 2); x.fill();
        x.strokeStyle = '#f3ead2'; x.lineWidth = 1.2 * U; x.stroke();
      }
    };
    for (const wr of G.world.sites.wrecks || []) {
      if (!G.quests.discovered.includes(wr.island)) continue;
      x.save(); x.translate(wr.x * S, wr.z * S); x.rotate(wr.h || 0);
      x.fillStyle = '#6a4a2a'; x.fillRect(-5 * U, -1.3 * U, 10 * U, 2.6 * U);
      x.strokeStyle = '#6a4a2a'; x.lineWidth = 1.2 * U; x.beginPath(); x.moveTo(-1 * U, 0); x.lineTo(2 * U, -5 * U); x.stroke();
      x.restore();
    }
    for (const m of G.quests.markers()) glyph(m, m.tracked);
    for (const b of G.props.bottles) glyph({ x: b.x, z: b.z, icon: 'bottle' }, false);
    const n = G.npcs;
    for (const id of ['mags', 'tallow']) { const p = n.get(id); if (p && G.quests.discovered.includes(G.world.islandAt(p.site.x, p.site.z))) { x.fillStyle = '#1b2a30'; x.font = `${Math.round(13 * U)}px "Silkscreen", monospace`; x.fillText(id === 'mags' ? '⚓' : '☀', p.site.x * S, (p.site.z + 7) * S); } }
    const drawShip = (sx, sz, h, col) => {
      x.save(); x.translate(sx * S, sz * S); x.rotate(-h); x.fillStyle = col;
      x.beginPath(); x.moveTo(0, -6.5 * U); x.lineTo(2.4 * U, 4.5 * U); x.lineTo(-2.4 * U, 4.5 * U); x.closePath(); x.fill(); x.restore();
    };
    if (G.sloop && !G.sloop.sinking) drawShip(G.sloop.pos.x, G.sloop.pos.z, G.sloop.heading, '#2f6f7e');
    for (const h of G.hollows) if (!h.sinking && Math.hypot(h.pos.x - G.player.pos.x, h.pos.z - G.player.pos.z) < (h.kind === 'hollow' ? 120 : 200)) drawShip(h.pos.x, h.pos.z, h.heading, { hollow: '#2e8a6e', merchant: '#d4a947', navy: '#e9e3d2', pirate: '#b8332a' }[h.kind] || '#2e8a6e');
    for (const c of G.net.role ? G.net.roster() : []) {
      x.fillStyle = c.host ? '#d8ad52' : '#e4775c'; x.strokeStyle = '#1b2a30'; x.lineWidth = 1.2 * U;
      x.beginPath(); x.arc(c.x * S, c.z * S, 3.6 * U, 0, Math.PI * 2); x.fill(); x.stroke();
      x.fillStyle = '#1b2a30'; x.font = `${Math.round(10 * U)}px "IM Fell English", Georgia, serif`;
      x.fillText(c.name, c.x * S, (c.z - 6) * S);
    }
    const P = G.player;
    x.save(); x.translate(P.pos.x * S, P.pos.z * S); x.rotate(-G.cameraYaw());
    x.fillStyle = '#b3402a'; x.strokeStyle = '#f3ead2'; x.lineWidth = 1.2 * U;
    x.beginPath(); x.moveTo(0, -5 * U); x.lineTo(3.4 * U, 4 * U); x.lineTo(0, 2 * U); x.lineTo(-3.4 * U, 4 * U); x.closePath(); x.fill(); x.stroke(); x.restore();
    if (!this.roseAt) {
      let best = null;
      for (const [rx, rz] of [[30, 30], [W - 30, 30], [30, D - 30], [W - 30, D - 30]]) {
        let cnt = 0;
        for (let dz = -24; dz <= 24; dz += 2) for (let dx = -24; dx <= 24; dx += 2) if (G.world.topSolid(rx + dx, rz + dz) + 1 > SEA) cnt++;
        for (const o of G.world.islands) if (Math.hypot(o.x - rx, o.z - o.r * 0.72 - 3 - rz) < 26) cnt += 40;
        if (!best || cnt < best.cnt) best = { cnt, rx, rz };
      }
      this.roseAt = best;
    }
    const cx = this.roseAt.rx * S, cy = this.roseAt.rz * S;
    x.strokeStyle = '#3b2c1e'; x.lineWidth = 1.2 * U;
    x.beginPath(); x.arc(cx, cy, 11 * U, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(cx, cy - 16 * U); x.lineTo(cx, cy + 16 * U); x.moveTo(cx - 16 * U, cy); x.lineTo(cx + 16 * U, cy); x.stroke();
    x.fillStyle = '#3b2c1e'; x.font = `${Math.round(9 * U)}px "Silkscreen", monospace`; x.fillText('N', cx, cy - 22 * U);
    if (noteEl) { const t = G.quests.tracked_(); noteEl.textContent = `${t.title}: ${t.text}.`; }
  }
}
export { tileCanvas, T };
