import { ITEMS, RECIPES, LOOKS } from './config.js';
import { itemIcon } from './ui.js';
import { randomLook } from './character.js';
import { UPGRADES, SUPPLIES, VESSELS, vesselProgress } from './shop.js';

// Every menu in the game is a parchment "sheet" laid over the live world.
const NAMES = { mags: 'Old Mags', tallow: 'Brother Tallow' };
const SLOT_NAMES = { auto: 'Autosave', s1: 'Slot 1', s2: 'Slot 2', s3: 'Slot 3' };

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style') el.style.cssText = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const c of kids.flat(3)) if (c != null && c !== false && c !== '') el.append(c instanceof Node ? c : String(c));
  return el;
}
function ago(ts) {
  if (!ts) return '';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}

export class Sheets {
  constructor(G) {
    this.g = G;
    this.el = document.getElementById('sheet');
    this.paper = document.getElementById('sheetPaper');
    this.name = null; this.opts = {}; this.t = 0; this.tok = 0;
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target !== this.el || !this.name) return;
      if ((this.name === 'captain' && this.opts.fresh) || this.name === 'ending') return;
      this.g.closeSheet();
    });
  }
  get isOpen() { return !!this.name; }
  open(name, opts = {}) {
    this.name = name; this.opts = { ...opts }; this.t = 0;
    this.el.classList.remove('hidden');
    this.el.classList.toggle('side', name === 'captain');
    this.el.classList.toggle('map-large', name === 'map' && !!opts.large);
    this.render();
    this.el.scrollTop = 0; this.paper.scrollTop = 0;
  }
  close() {
    this.name = null; this.opts = {}; this.tok++; this.mapCv = null;
    this.el.classList.add('hidden'); this.el.classList.remove('side', 'map-large');
    this.paper.replaceChildren();
  }
  render() {
    const fn = this['r_' + this.name];
    if (!fn) return;
    const tok = ++this.tok;
    const keep = this.paper.scrollTop;
    this.paper.replaceChildren();
    this.mapCv = null;
    fn.call(this, tok);
    this.paper.scrollTop = keep;
  }
  update(dt) {
    this.t += dt;
    if (this.name === 'map' && this.t > 0.4) { this.t = 0; this.drawMap(); }
    if (this.name === 'crew' && this.t > 0.5) { this.t = 0; const k = this.crewKey(); if (k !== this.lastCrewKey) this.render(); }
  }

  // ---------------------------------------------------------------- building blocks
  btn(label, fn, cls = 'btn', disabled = false) {
    return h('button', { type: 'button', class: cls, disabled: disabled ? true : null, onclick: (e) => { e.preventDefault(); if (!disabled) fn(e); } }, label);
  }
  confirmBtn(label, fn, cls = 'btn small ghost') {
    let armed = false;
    const b = this.btn(label, () => {
      if (!armed) { armed = true; b.textContent = 'Are you sure?'; setTimeout(() => { armed = false; if (b.isConnected) b.textContent = label; }, 3000); return; }
      fn();
    }, cls);
    return b;
  }
  head(sub, title, closable = true, closeLabel = 'Close') {
    return h('header', {}, h('div', {}, sub ? h('h3', { text: sub }) : null, h('h2', { text: title })), closable ? this.btn(closeLabel, () => this.g.closeSheet(), 'btn small ghost') : null);
  }
  tabs(list, cur) {
    return h('div', { class: 'tabs', role: 'tablist' }, list.map(([v, l]) => h('button', {
      type: 'button', role: 'tab', class: 'btn small' + (v === cur ? ' on' : ' ghost'), 'aria-selected': v === cur ? 'true' : 'false',
      onclick: () => { this.opts.tab = v; this.render(); },
    }, l)));
  }
  card(o) {
    return h('div', { class: 'card' + (o.story ? ' story' : '') + (o.tracked ? ' tracked' : '') },
      h('div', { class: 'ct', text: o.title }),
      o.text ? h('div', { class: 'cd', text: o.text }) : null,
      o.meta ? h('div', { class: 'cr', text: o.meta }) : null,
      o.actions && o.actions.filter(Boolean).length ? h('div', { class: 'row' }, o.actions.filter(Boolean)) : null);
  }
  optRow(label, options, cur, fn) {
    return h('div', { class: 'field' }, h('span', { text: label }), h('div', { class: 'row' }, options.map(([v, l]) => h('button', {
      type: 'button', class: 'opt' + (v === cur ? ' on' : ''), 'aria-pressed': v === cur ? 'true' : 'false', onclick: () => fn(v),
    }, l))));
  }
  swatches(label, colors, cur, fn, names) {
    return h('div', { class: 'field' }, h('span', { text: label }), h('div', { class: 'swatches' }, colors.map((c, i) => h('button', {
      type: 'button', class: 'sw' + (i === cur ? ' on' : ''), style: `background:${c}`, 'aria-label': names ? names[i] : `${label} ${i + 1}`, 'aria-pressed': i === cur ? 'true' : 'false', title: names ? names[i] : null,
      onclick: () => fn(i),
    }))));
  }
  range(label, min, max, step, val, fn, fmt) {
    const out = h('b', { text: fmt(val) });
    const inp = h('input', { type: 'range', min, max, step, value: val, oninput: (e) => { const v = parseFloat(e.target.value); out.textContent = fmt(v); fn(v); } });
    return h('label', {}, h('span', { class: 'row' }, label, out), inp);
  }
  check(label, val, fn) {
    const inp = h('input', { type: 'checkbox', checked: val ? true : null, onchange: (e) => fn(e.target.checked) });
    return h('label', { class: 'check' }, inp, label);
  }
  textField(label, val, max, fn) {
    const inp = h('input', { type: 'text', maxlength: max, value: val, spellcheck: 'false', autocomplete: 'off',
      onchange: (e) => fn(e.target.value.trim().slice(0, max)),
      onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } });
    return h('label', {}, label, inp);
  }
  cloudLine() {
    const c = this.g.saves.cloud;
    if (c === 'on') return 'Saves sync to your Claude account, so they follow you to other devices.';
    if (c === 'checking') return 'Checking for cloud saves…';
    if (c === 'readonly') return 'Cloud saves are unavailable right now; new saves stay in this browser.';
    return 'Saves are kept in this browser. The game also autosaves as you play.';
  }

  // ---------------------------------------------------------------- map
  r_map() {
    const G = this.g;
    const large = this.el.classList.contains('map-large');
    this.paper.append(this.head(`Day ${G.sky.day}`, 'Sea chart'));
    this.mapCv = h('canvas', { id: 'mapCanvas', width: large ? 1024 : 768, height: large ? 1024 : 768, role: 'img', 'aria-label': 'Chart of the archipelago' });
    this.mapNote = h('p', { class: 'muted' });
    const expand = this.btn(large ? 'Fit chart' : 'Expand chart', () => {
      const large = !this.el.classList.contains('map-large');
      this.el.classList.toggle('map-large', large);
      this.mapCv.width = this.mapCv.height = large ? 1024 : 768;
      expand.textContent = large ? 'Fit chart' : 'Expand chart';
      expand.setAttribute('aria-pressed', String(large));
      this.drawMap();
    }, 'btn small ghost');
    expand.setAttribute('aria-pressed', String(large));
    this.paper.append(h('div', { class: 'row' }, expand), this.mapCv, this.mapNote, h('p', { class: 'muted', text: 'Red X: treasure. Dashed circle: a torn chart, so search inside it. Dots mark people, camps, bottles and ships. Grey islands are still uncharted.' }));
    this.drawMap();
  }
  drawMap() { if (this.mapCv) this.g.ui.drawMap(this.mapCv, this.mapNote); }

  // ---------------------------------------------------------------- bag and crafting
  // your sea chest aboard the sloop: stow things, take them back
  r_chest() {
    const G = this.g;
    this.paper.append(this.head('Aboard your ship', 'Sea chest'));
    this.paper.append(h('p', { class: 'muted', text: 'Stow gold and loot you don’t want to lose. What you carry sinks with you when you die; what’s in the chest is safe unless your ship goes down. Sell loot to Old Mags.' }));
    const gold = h('div', { class: 'chestList' });
    gold.append(h('div', { class: 'chestRow' }, h('span', { class: 'coin' }), h('span', { class: 'nm', text: 'Gold' }), h('span', { class: 'ct', text: `${G.gold} carried · ${G.chestGold || 0} stowed` }),
      this.btn('Stow all', () => { G.moveChestGold(true, G.gold); this.render(); }, 'btn small', !(G.gold > 0)),
      this.btn('Take all', () => { G.moveChestGold(false, G.chestGold || 0); this.render(); }, 'btn small ghost', !(G.chestGold > 0))));
    this.paper.append(gold);
    const lc = G.lootValue(G.chest), li = G.lootValue(G.inv);
    if (lc || li) this.paper.append(h('p', { class: 'muted', text: `Loot in your bag is worth ${li} gold; in the chest, ${lc} gold.` }));
    const grid = (from, to, verb) => {
      const keys = Object.keys(ITEMS).filter((k) => (from[k] || 0) > 0 && !ITEMS[k].tool && !ITEMS[k].quest);
      if (!keys.length) return h('p', { class: 'muted', text: 'Nothing here.' });
      const g = h('div', { class: 'chestList' });
      for (const k of keys) {
        const move = (n) => { const m = Math.min(n, from[k] || 0); from[k] -= m; to[k] = (to[k] || 0) + m; if (!from[k]) delete from[k]; G.sfx.place(); G.ui.buildHotbar(); this.render(); };
        g.append(h('div', { class: 'chestRow' }, itemIcon(k), h('span', { class: 'nm', text: ITEMS[k].name + (ITEMS[k].loot ? ` · ${ITEMS[k].loot} gold` : '') }), h('span', { class: 'ct', text: '×' + from[k] }),
          this.btn(verb, () => move(1), 'btn small'), from[k] > 1 ? this.btn('All', () => move(from[k]), 'btn small ghost') : null));
      }
      return g;
    };
    this.paper.append(h('h3', { text: 'In your bag' }), grid(G.inv, G.chest, 'Stow'));
    this.paper.append(h('h3', { text: 'In the chest' }), grid(G.chest, G.inv, 'Take'));
  }
  r_bag() {
    const G = this.g, tab = this.opts.tab || 'items';
    this.paper.append(this.head('Inventory', 'Bag'), this.tabs([['items', 'Items'], ['craft', 'Craft']], tab));
    if (tab === 'craft') { this.craftList(); return; }
    const slot = this.opts.slot ?? G.sel;
    this.paper.append(h('p', { class: 'muted', text: G.isTouch ? 'Tap a hotbar slot, then tap an item to put it there.' : 'Choose a hotbar slot, then an item to put in it. In play, keys 1 to 9 pick a slot.' }));
    const bar = h('div', { class: 'miniBar', role: 'group', 'aria-label': 'Hotbar' });
    G.hotbar.forEach((it, i) => bar.append(h('button', {
      type: 'button', class: i === slot ? 'sel' : '', 'aria-label': `Slot ${i + 1}: ${it ? ITEMS[it].name : 'empty'}`,
      onclick: () => { this.opts.slot = i; this.render(); },
    }, it ? itemIcon(it) : null)));
    this.paper.append(bar);
    const keys = Object.keys(ITEMS).filter((k) => (G.inv[k] || 0) > 0);
    const grid = h('div', { class: 'items' });
    for (const k of keys) {
      const d = ITEMS[k], special = d.cargo || d.quest || d.loot;
      grid.append(h('button', {
        type: 'button', class: 'item' + (G.hotbar.includes(k) ? ' inbar' : '') + (special ? ' disabled' : ''),
        title: special ? (d.cargo ? 'Cargo for a delivery' : d.loot ? `Loot worth ${d.loot} gold: sell it to Old Mags` : 'Keep this for a quest') : `Put in slot ${slot + 1}`,
        onclick: special ? null : () => this.assign(k, slot),
      }, itemIcon(k), h('span', { text: d.name }), d.tool ? null : h('span', { text: '×' + G.inv[k] })));
    }
    this.paper.append(keys.length ? grid : h('p', { class: 'muted', text: 'Your bag is empty.' }));
    const lv = G.lootValue(G.inv);
    if (lv) this.paper.append(h('p', { class: 'muted', text: `You carry loot worth ${lv} gold. Sell it to Old Mags at Brine Haven, or stow it in your ship’s hold so a death doesn’t cost you it.` }));
    this.paper.append(h('div', { class: 'row' }, this.btn('Empty this slot', () => { G.hotbar[slot] = null; G.ui.buildHotbar(); this.render(); }, 'btn small ghost')));
  }
  assign(k, slot) {
    const G = this.g;
    const j = G.hotbar.indexOf(k);
    if (j >= 0 && j !== slot) G.hotbar[j] = G.hotbar[slot];
    G.hotbar[slot] = k; G.sel = slot;
    G.ui.buildHotbar();
    this.render();
  }
  craftList() {
    const G = this.g;
    this.paper.append(h('p', { class: 'muted', text: 'Recipes use what is in your bag. Chop trees for wood, mine stone with the pickaxe, and knock coconuts out of palm trees.' }));
    RECIPES.forEach((r, i) => {
      const cost = h('div', { class: 'rcost' }, Object.entries(r.cost).map(([k, v]) => h('span', { class: 'chipc' + ((G.inv[k] || 0) < v ? ' short' : ''), text: `${v} ${ITEMS[k].name.toLowerCase()} (have ${G.inv[k] || 0})` })));
      const owned = r.tool && (G.inv[r.out] || 0) > 0;
      const can = G.canCraft(i) && !owned, can5 = !r.tool && G.canCraft(i, 5);
      this.paper.append(h('div', { class: 'recipe' },
        itemIcon(r.out),
        h('div', {}, h('div', { class: 'rname', text: r.tool ? ITEMS[r.out].name : `${ITEMS[r.out].name} ×${r.n}` }), h('div', { class: 'rnote', text: r.note }), cost),
        h('div', { class: 'row' }, this.btn(owned ? 'Owned' : 'Craft', () => { G.craft(i); this.render(); }, 'btn small', !can), can5 ? this.btn('×5', () => { G.craft(i, 5); this.render(); }, 'btn small ghost') : null)));
    });
  }

  // ---------------------------------------------------------------- quest log
  r_quests() {
    const G = this.g, Q = G.quests, N = G.net;
    if (N.inCrew) {
      const o = N.crewObjective();
      this.paper.append(this.head(`Sailing with ${N.hostName}`, 'Quests'));
      this.paper.append(this.card({ title: 'Captain’s orders', text: o ? o.text : 'Follow the captain.', meta: 'Crew', story: true, tracked: true }));
      this.paper.append(h('p', { class: 'muted', text: `Your own story waits on your voyage: ${Q.chapter}. Your contracts wait there too. Islands you pass now are added to your own chart (${Q.discovered.length} of ${G.world.islands.length}).` }));
      return;
    }
    const tr = Q.tracked_();
    this.paper.append(this.head(Q.done ? 'Free sailing' : `Chapter ${Q.step + 1} of 8`, 'Quests'));
    const so = Q.storyObjective();
    this.paper.append(this.card({ title: Q.chapter, text: so.text, meta: 'Story', story: true, tracked: tr.id === 'story', actions: [tr.id === 'story' ? null : this.btn('Track', () => { Q.tracked = 'story'; this.render(); }, 'btn small ghost')] }));
    if (Q.step >= 1 || Q.flags.shipwrightIntro) {
      const yard = Q.shipyardObjective();
      this.paper.append(this.card({
        title: yard.title, text: yard.text, meta: 'Side story · shipyard', story: true, tracked: tr.id === 'shipwright',
        actions: [Q.flags.shipwrightIntro && tr.id !== 'shipwright' ? this.btn('Track', () => { Q.tracked = 'shipwright'; this.render(); }, 'btn small ghost') : null],
      }));
    }
    this.paper.append(h('p', { class: 'muted', text: 'Choose Track to set an objective on your compass. New contracts are offered by Old Mags at Brine Haven and Brother Tallow at the lighthouse.' }));
    if (!Q.active.length) this.paper.append(h('p', { class: 'muted', text: 'No contracts yet. Old Mags at Brine Haven posts new work every day, and Brother Tallow does too once the lighthouse burns again.' }));
    for (const q of Q.active) {
      const o = Q.contractObjective(q);
      const reward = q.kind === 'chart' ? 'Reward: whatever the chest holds' : `Reward: ${q.reward} gold from ${NAMES[q.giver] || 'the giver'}`;
      this.paper.append(this.card({
        title: q.title, text: o.text, meta: reward, tracked: tr.id === q.id,
        actions: [tr.id === q.id ? null : this.btn('Track', () => { Q.tracked = q.id; this.render(); }, 'btn small ghost'), this.confirmBtn('Abandon', () => { Q.abandon(q.id); this.render(); })],
      }));
    }
    this.paper.append(h('p', { class: 'muted', text: `Contracts ${Q.active.length} of 3 · Islands charted ${Q.discovered.length} of ${G.world.islands.length}` }));
  }

  // ---------------------------------------------------------------- people
  r_npc() {
    const G = this.g, Q = G.quests, id = this.opts.npc, n = G.npcs.get(id);
    if (!n) { G.closeSheet(); return; }
    const crew = G.net.inCrew;
    const d = crew ? { greeting: id === 'mags' ? 'A new face off the captain’s ship. Coin’s coin, love. Bank it or spend it.' : 'Welcome, sailor. The light burns for every crew.', bank: id === 'mags' && (G.gold > 0 || G.lootValue(G.inv) > 0), shop: id === 'mags', ready: [], offers: [] } : Q.dialog(id);
    const pc = h('canvas', { width: 96, height: 96, 'aria-hidden': 'true' });
    const px = pc.getContext('2d'); px.imageSmoothingEnabled = false; px.drawImage(n.portrait, 0, 0, 96, 96);
    this.paper.append(h('header', {}, h('div', { class: 'npc' }, pc, h('div', {}, h('div', { class: 'nn', text: n.def.name }), h('div', { class: 'nr', text: n.def.role }))), this.btn('Goodbye', () => G.closeSheet(), 'btn small ghost')));
    this.paper.append(h('p', { class: 'say', text: d.greeting }));
    const lv = G.lootValue(G.inv);
    if (d.bank || (id === 'mags' && lv > 0)) this.paper.append(this.card({ title: lv ? `You carry ${G.gold} gold and loot worth ${lv}` : `You carry ${G.gold} gold`, text: lv ? 'Mags buys goblets, pearls, rubies and idols at a fair price, and banks the lot. Banked gold is safe; carried gold and loot sink with you.' : 'Banked gold is safe from storms, skeletons and the Hollow Wake. Carried gold sinks with you.', actions: [this.btn(lv ? `Sell and bank ${G.gold + lv} gold` : `Bank ${G.gold} gold`, () => { G.bank(); this.render(); })] }));
    if (d.story) this.paper.append(this.card({ title: Q.chapter, text: d.story.text, story: true, actions: [this.btn(d.story.button, () => { const nm = this.name; d.story.act(); if (this.name === nm) this.render(); })] }));
    if (d.shipwright) this.paper.append(this.card({ title: 'The Shipwright’s Wager', text: d.shipwright.text, story: true, actions: [this.btn(d.shipwright.button, () => { const nm = this.name; d.shipwright.act(); if (this.name === nm) this.render(); })] }));
    for (const q of d.ready) {
      this.paper.append(this.card({ title: q.title, text: q.kind === 'delivery' ? 'Hand over the cargo.' : 'The job is done. Collect your pay.', meta: `Reward: ${q.reward} gold`, actions: [this.btn('Hand in', () => { Q.turnIn(q.id, id); this.render(); })] }));
    }
    if (d.offers && d.offers.length) {
      this.paper.append(h('h3', { text: 'Contracts on the board' }));
      const full = Q.active.length >= 3;
      for (const o of d.offers) {
        this.paper.append(this.card({
          title: o.title, text: o.desc, meta: typeof o.reward === 'number' ? `Reward: ${o.reward} gold` : `Reward: ${o.reward}`,
          actions: [this.btn(full ? 'You hold three' : 'Accept', () => { if (Q.accept(id, o.oid)) { G.ui.toast('Contract taken', o.title, ''); this.render(); } }, 'btn small', full)],
        }));
      }
    }
    if (crew) this.paper.append(h('p', { class: 'muted', text: 'Story work and contracts are waiting on your own voyage.' }));
    const row = h('div', { class: 'row' });
    if (d.shop) row.append(this.btn('Trade', () => G.openSheet('shop', { npc: id })));
    if (d.rest) row.append(this.btn(d.rest.label, () => d.rest.act(), 'btn ghost'));
    row.append(this.btn('Goodbye', () => G.closeSheet(), 'btn ghost'));
    this.paper.append(row);
  }
  r_shop() {
    const G = this.g;
    this.paper.append(this.head(`${G.banked} gold banked`, 'Trading post'));
    this.paper.append(h('p', { class: 'muted', text: G.net.inCrew ? 'Old Mags only takes banked gold. Shipyard refits wait until you are back on your own voyage.' : `Old Mags only takes banked gold. Your ${G.sloop.design.label} is in service; upgrades carry across every hull. Step ashore to commission or switch boats.` }));
    this.paper.append(h('h3', { text: 'Shipyard' }));
    const hulls = [{ id: 'sloop', name: 'Sloop', price: 0, starter: true, desc: 'Your original, balanced all-rounder.' }, ...VESSELS];
    for (const vessel of hulls) {
      const owned = !!G.ownedShips[vessel.id], active = G.shipType === vessel.id;
      const progress = vessel.starter ? null : vesselProgress(G, vessel);
      const previous = vessel.requires === 'sloop' || (vessel.requires && G.ownedShips[vessel.requires]);
      const charter = vessel.starter || (G.quests.flags.shipwrightIntro && previous && progress.unlocked);
      const canRefit = G.player.mode === 'foot' && !G.player.ship && !G.net.inCrew;
      const nextName = vessel.requires && VESSELS.find((v) => v.id === vessel.requires)?.name;
      const state = active ? 'In service.' : owned ? 'Owned; available at the pier.' : !G.quests.flags.shipwrightIntro ? 'Ask Old Mags about the Shipwright’s Wager.' : !previous ? `Commission the ${nextName} first.` : `${progress.text}. Any one route earns its charter.`;
      this.paper.append(h('div', { class: 'shopitem' + (owned ? ' owned' : '') },
        h('div', {}, h('div', { class: 'rname', text: vessel.name }), h('div', { class: 'rnote', text: `${vessel.desc} ${state}` })),
        this.btn(active ? 'In service' : owned ? 'Select' : `Commission · ${vessel.price}`, () => {
          const changed = owned ? G.selectVessel(vessel.id) : G.buyVessel(vessel.id);
          if (changed) this.render();
        }, 'btn small', active || !canRefit || (!owned && (!charter || G.banked < vessel.price)))));
    }
    this.paper.append(h('p', { class: 'muted', text: 'Charter routes are tracked in your quest log. Switching hulls recalls your current boat to the Brine Haven pier and preserves its hull condition.' }));
    this.paper.append(h('h3', { text: 'Upgrades' }));
    for (const u of UPGRADES) {
      const owned = !!G.upgrades[u.id], locked = !owned && ((u.req && !G.upgrades[u.req]) || (u.reqVessel && !G.ownedShips[u.reqVessel]));
      const needUpgrade = !owned && u.req && !G.upgrades[u.req] ? `Needs ${UPGRADES.find((x) => x.id === u.req).name.toLowerCase()} first.` : '';
      const needVessel = !owned && u.reqVessel && !G.ownedShips[u.reqVessel] ? `Needs a ${VESSELS.find((v) => v.id === u.reqVessel).name} charter first.` : '';
      const note = [u.desc, needUpgrade, needVessel].filter(Boolean).join(' ');
      this.paper.append(h('div', { class: 'shopitem' + (owned ? ' owned' : '') },
        h('div', {}, h('div', { class: 'rname', text: u.name }), h('div', { class: 'rnote', text: note })),
        this.btn(owned ? 'Owned' : `Buy · ${u.price}`, () => { if (G.buyUpgrade(u.id)) this.render(); }, 'btn small', owned || locked || G.banked < u.price)));
    }
    this.paper.append(h('h3', { text: 'Supplies' }));
    SUPPLIES.forEach((s, i) => {
      this.paper.append(h('div', { class: 'shopitem' },
        h('div', { class: 'row' }, itemIcon(s.item), h('div', {}, h('div', { class: 'rname', text: `${s.n} ${ITEMS[s.item].name.toLowerCase()}` }), h('div', { class: 'rnote', text: `You have ${G.inv[s.item] || 0}.` }))),
        this.btn(`Buy · ${s.price}`, () => { if (G.buySupply(i)) this.render(); }, 'btn small', G.banked < s.price)));
    });
    this.paper.append(h('div', { class: 'row' }, this.btn('Back to Old Mags', () => G.openSheet('npc', { npc: this.opts.npc || 'mags' }), 'btn ghost')));
  }

  // ---------------------------------------------------------------- menu, saves, settings
  r_menu() {
    const G = this.g;
    this.paper.append(this.head(`Day ${G.sky.day} · ${G.quests.chapter}`, 'Paused'));
    this.paper.append(h('div', { class: 'row' },
      this.btn('Resume', () => G.closeSheet()),
      this.btn('Save', () => G.openSheet('saves', { mode: 'save' }), 'btn ghost'),
      this.btn('Load', () => G.openSheet('saves', { mode: 'load' }), 'btn ghost'),
      this.btn('Customize captain & ship', () => G.openSheet('captain', {}), 'btn ghost'),
      G.net.available || G.net.role ? this.btn(G.net.role === 'host' ? `Crew · ${G.net.crew.size}` : G.net.inCrew ? 'Crew · aboard' : 'Crew', () => G.openSheet('crew'), 'btn ghost') : null,
      this.btn('Settings', () => G.openSheet('settings', {}), 'btn ghost'),
      this.btn('How to play', () => G.openSheet('help', {}), 'btn ghost'),
      this.btn('Replay voyage guide', () => G.replayTutorial(), 'btn ghost'),
      G.player.alive ? this.btn('I’m stuck', () => G.startStuck(), 'btn ghost') : null));
    this.paper.append(h('div', { class: 'row' },
      this.btn('Sea chart', () => G.openSheet('map')),
      this.btn('Quest log · choose objective', () => G.openSheet('quests'), 'btn ghost')));
    const Q = G.quests;
    this.paper.append(h('div', { class: 'stats' },
      'Gold banked', h('b', { text: String(G.banked) }), 'Gold carried', h('b', { text: String(G.gold) }),
      'Contracts done', h('b', { text: String(Q.stats.contracts) }), 'Islands charted', h('b', { text: `${Q.discovered.length} of ${G.world.islands.length}` })));
    this.paper.append(h('p', { class: 'muted', text: this.cloudLine() }));
    this.paper.append(h('div', { class: 'row' }, this.confirmBtn('Quit to title', () => G.quitToTitle())));
  }

  // ---------------------------------------------------------------- crews
  crewKey() {
    const N = this.g.net;
    return JSON.stringify([N.role, N.available, N.closed, N.crews().map((c) => [c.peer, c.n, c.full, c.day]), N.sailors().length, N.roster().map((m) => [m.name, m.alive, m.aboard])]);
  }
  r_crew() {
    const G = this.g, N = G.net;
    this.lastCrewKey = this.crewKey();
    const sub = N.role === 'host' ? 'Your ship, your course' : N.inCrew ? `Aboard ${N.hostShip || 'the ship'}` : 'Sail with friends';
    this.paper.append(this.head(sub, 'Crew'));
    if (!N.available && !N.role) {
      this.paper.append(h('p', { text: 'Crews need this page open inside Claude. Share it with your friends from the Share menu, and you can sail together whenever you are here at the same time.' }));
    } else if (N.role === 'host') {
      this.paper.append(h('p', { text: 'Your voyage is open. Friends who have this page open can come aboard from Crew in their menu. They keep their own gold and gear; you keep the wheel and the story.' }));
      if (!N.crew.size) this.paper.append(h('p', { class: 'muted', text: 'Nobody aboard yet.' }));
      for (const rec of N.crew.values()) {
        const m = rec.mate;
        const where = !m.has ? 'Rowing out…' : !m.alive ? 'Down' : m.aboard ? 'On deck' : 'Ashore';
        this.paper.append(h('div', { class: 'crewrow' }, h('div', {}, h('div', { class: 'cn', text: m.name }), h('div', { class: 'cm', text: `${where} · ${Math.ceil(m.hp)} health` })), this.confirmBtn('Put ashore', () => { N.kick(rec.peer); this.render(); })));
      }
      this.paper.append(this.check('Let new crew join', !N.closed, (v) => N.setClosed(!v)));
      this.paper.append(h('div', { class: 'row' }, this.confirmBtn('Close the voyage', () => { N.closeHost(); this.render(); }, 'btn small ghost')));
    } else if (N.isCrew) {
      this.paper.append(h('p', { text: `You sail with ${N.hostName}. Your gold, gear and look stay yours and go home with you. Islands you pass are added to your own chart.` }));
      for (const m of N.roster()) this.paper.append(h('div', { class: 'crewrow' + (m.host ? ' me' : '') }, h('div', {}, h('div', { class: 'cn', text: (m.host ? '⚓ ' : '') + m.name }), h('div', { class: 'cm', text: `${m.host ? 'Captain' : 'Crew'} · ${!m.alive ? 'down' : m.aboard ? 'on deck' : 'ashore'}` }))));
      this.paper.append(h('div', { class: 'row' }, this.confirmBtn('Leave the crew', () => { G.closeSheet(); N.leave('You rowed back to your own voyage.'); }, 'btn small ghost')));
    } else {
      const inGame = G.state === 'play' || G.state === 'sheet';
      this.paper.append(this.card({ title: 'Open your voyage', text: 'Friends who have this page open can come aboard your ship. Your world and your story; they bring their own gold and gear.', actions: [inGame ? this.btn('Open to friends', async () => { await N.startHost(); if (this.name === 'crew') this.render(); }) : null] }));
      this.paper.append(h('h3', { text: 'Crews at sea' }));
      const crews = N.crews();
      if (!crews.length) this.paper.append(h('p', { class: 'muted', text: 'No open voyages right now. When a friend opens theirs, it shows up here.' }));
      for (const c of crews) {
        this.paper.append(h('div', { class: 'crewrow' }, h('div', {}, h('div', { class: 'cn', text: `${c.name}${c.mine ? ' (you, in another tab)' : c.guest ? ' (guest)' : ''}` }), h('div', { class: 'cm', text: `${c.ship} · day ${c.day} · ${c.n} aboard` })),
          this.btn(c.full ? 'Full' : 'Join', () => N.join(c), 'btn small', c.full || !inGame)));
      }
      const others = N.sailors();
      if (others.length) this.paper.append(h('p', { class: 'muted', text: `Also here: ${others.map((o) => `${o.name} (${o.at === 'crew' ? 'in a crew' : o.at === 'sea' ? 'sailing alone' : 'in port'})`).join(', ')}.` }));
    }
    this.paper.append(h('p', { class: 'muted', text: 'Friends need this page shared with them from the Share menu and to be signed in to Claude. Up to four pirates per ship.' }));
  }
  r_saves(tok) {
    const G = this.g, mode = this.opts.mode || 'load', inGame = G.state === 'play' || G.state === 'sheet';
    this.paper.append(this.head(mode === 'save' ? 'Write your voyage to a slot' : 'Pick a voyage', mode === 'save' ? 'Save' : 'Load'));
    this.paper.append(h('p', { class: 'muted', text: this.cloudLine() }));
    const list = h('div', {}, h('p', { class: 'muted', text: 'Reading saves…' }));
    this.paper.append(list);
    G.saves.list().then((slots) => {
      if (tok !== this.tok) return;
      list.replaceChildren();
      for (const { slot, meta } of slots) {
        const line = meta ? `${meta.name}, ${meta.ship || 'a sloop'}. Day ${meta.day}, ${meta.chapter}. ${meta.banked || 0} gold banked. Saved ${ago(meta.savedAt)}.` : 'Empty';
        const acts = h('div', { class: 'row' });
        if (mode === 'save' && slot !== 'auto' && inGame) acts.append(this.btn(meta ? 'Overwrite' : 'Save here', async () => { await G.saveToSlot(slot); if (this.name === 'saves') this.render(); }, 'btn small'));
        if (mode === 'load' && meta) acts.append(this.btn('Load', () => G.loadSlot(slot), 'btn small'));
        if (meta && slot !== 'auto') acts.append(this.confirmBtn('Delete', async () => { await G.saves.remove(slot); if (this.name === 'saves') this.render(); }));
        list.append(h('div', { class: 'slotcard' }, h('div', {}, h('div', { class: 'sn', text: SLOT_NAMES[slot] }), h('div', { class: 'sm', text: line })), acts));
      }
    }).catch(() => { if (tok === this.tok) list.replaceChildren(h('p', { class: 'muted', text: 'Saves could not be read.' })); });
    this.paper.append(h('h3', { text: 'Save files' }));
    const out = h('div', { class: 'form' });
    const row = h('div', { class: 'row' });
    if (inGame) {
      row.append(this.btn('Download save file', async () => {
        const r = await G.exportSave();
        if (r.ok) G.ui.toast('Save file ready', 'Look in your downloads.', 'good');
        else if (r.declined) G.ui.toast('Download cancelled', 'Nothing was written.', '');
        else if (r.text) out.replaceChildren(h('p', { class: 'muted', text: 'Downloads are blocked here. Copy this text and keep it somewhere safe, then paste it back to load.' }), h('textarea', { class: 'code', readonly: true, 'aria-label': 'Save data' }, r.text));
      }, 'btn small ghost'));
    }
    const file = h('input', {
      type: 'file', accept: '.json,application/json', style: 'display:none',
      onchange: async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try { await G.importText(await f.text()); } catch (err) { G.ui.toast('Could not load that file', err.message || 'It is not a Brinebound save.', 'bad'); }
      },
    });
    row.append(file, this.btn('Load a save file', () => file.click(), 'btn small ghost'));
    row.append(this.btn('Paste save text', () => {
      const ta = h('textarea', { class: 'code', 'aria-label': 'Paste save data', placeholder: 'Paste save text here' });
      out.replaceChildren(ta, h('div', { class: 'row' }, this.btn('Load pasted save', async () => {
        try { await G.importText(ta.value.trim()); } catch (err) { G.ui.toast('Could not read that text', err.message || 'It is not a Brinebound save.', 'bad'); }
      }, 'btn small')));
      ta.focus();
    }, 'btn small ghost'));
    this.paper.append(row, out);
    this.paper.append(h('div', { class: 'row' }, this.btn('Back', () => { if (G.state === 'title') G.closeSheet(); else G.openSheet('menu'); }, 'btn ghost')));
  }
  r_settings() {
    const G = this.g, S = G.settings;
    this.paper.append(this.head('Settings', 'Settings'));
    const set = (k, v) => { S.set(k, v); G.applySettings(); };
    const form = h('div', { class: 'form' });
    form.append(this.optRow('Graphics', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']], S.get('quality'), (v) => { set('quality', v); this.render(); }));
    form.append(this.optRow('View distance', [['near', 'Near'], ['normal', 'Normal'], ['far', 'Far']], S.get('view'), (v) => { set('view', v); this.render(); }));
    form.append(this.optRow('Camera', [['first', 'First person'], ['third', 'Third person']], G.camMode, (v) => { G.camMode = v; S.set('camera', v); this.render(); }));
    form.append(this.range('Field of view', 60, 95, 1, S.get('fov'), (v) => set('fov', v), (v) => `${Math.round(v)}°`));
    form.append(this.range('Look sensitivity', 0.4, 2, 0.05, S.get('sens'), (v) => set('sens', v), (v) => `${v.toFixed(2)}×`));
    form.append(this.range('Volume', 0, 1, 0.05, S.get('volume'), (v) => set('volume', v), (v) => `${Math.round(v * 100)}%`));
    form.append(this.check('Invert looking up and down', S.get('invertY'), (v) => set('invertY', v)));
    form.append(this.check('Music', S.get('music'), (v) => set('music', v)));
    form.append(this.check('Show frames per second', S.get('fps'), (v) => set('fps', v)));
    this.paper.append(form);
    const q = G.qualityName();
    this.paper.append(h('p', { class: 'muted', text: S.get('quality') === 'auto' ? `Auto is using ${q} quality on this device and steps down if the game runs slowly.` : `Using ${q} quality.` }));
    this.paper.append(h('div', { class: 'row' }, this.btn('Done', () => { if (G.state === 'title') G.closeSheet(); else G.openSheet('menu'); })));
  }
  r_help() {
    const G = this.g;
    this.paper.append(this.head('How to play', 'Controls'));
    const desk = [['Move', 'W A S D'], ['Look', 'Mouse'], ['Mine, chop, attack', 'Hold left click'], ['Place, eat, drink, throw the hook', 'Right click'], ['Talk, take the helm', 'F or E'], ['Jump, swim up, let go of the hook', 'Space'], ['Sprint', 'Shift'], ['Slide (while sprinting)', 'C'], ['Crouch: sneak, and stop at edges', 'C'], ['Emotes', 'G'], ['Climb a ledge', 'Run or jump at it'], ['Hammer: next piece, wood or stone', 'Q, X'], ['Hotbar', '1 to 9, mouse wheel'], ['Map', 'M'], ['Quests', 'J'], ['Bag', 'I or B'], ['Craft', 'Tab'], ['Camera', 'V'], ['Repair the hull', 'R (planks)'], ['Chat with your crew', 'T or Enter'], ['Menu', 'P or Esc'], ['Stuck in the ground', 'Menu, I’m stuck, then hold still']];
    const helm = [['Raise and lower sail', 'W and S'], ['Steer', 'A and D'], ['Fire port and starboard', 'Q and E'], ['Look around', 'Mouse'], ['Leave the helm', 'F']];
    const aboard = [['Board any ship', 'Swim to her side, or hook her rail'], ['Take the wheel (up on the quarterdeck)', 'F by the wheel'], ['Man a gun, then aim and fire', 'F by the gun, then click'], ['Climb to the crow’s nest', 'F by the mast, then W'], ['Your sea chest (down in the hold)', 'F by the chest']];
    const touch = [['Move', 'Left half of the screen'], ['Look', 'Right half of the screen'], ['Mine, attack, fire a gun', 'Hit'], ['Place, eat, throw the hook, aim the musket', 'Place'], ['Crouch', 'Crouch'], ['Emotes', 'Emote'], ['Building pieces', 'Tap them above the hotbar'], ['At the helm', 'Stick up for sail, sideways to steer, Fire buttons for broadsides']];
    const table = (rows) => h('div', { class: 'stats' }, rows.map(([a, b]) => [a, h('b', { text: b })]));
    if (G.isTouch) { this.paper.append(h('h3', { text: 'Touch' }), table(touch)); }
    this.paper.append(h('h3', { text: 'On foot' }), table(desk), h('h3', { text: 'Aboard your ship' }), table(aboard), h('h3', { text: 'At the helm' }), table(helm));
    this.paper.append(h('h3', { text: 'Building and breaking' }), h('p', { class: 'muted', text: 'Hold the builder’s hammer to put down floors, walls, windows, doorways, stairs, roofs and posts. Walls snap to the edge of the floor you aim at; stairs and roofs climb away from you. Wood costs planks, stone costs bricks. Cut a tree at the trunk and it comes down whole. Knock out what holds something up and it falls. Powder kegs (Craft) go off a few seconds after you hit them.' }));
    this.paper.append(h('h3', { text: 'Guns' }), h('p', { class: 'muted', text: 'Pick a gun on your hotbar and click to fire: one ball, then a reload (the ring round the crosshair). The pistol is quick, the blunderbuss sprays shot up close, and the long musket hits far: hold right click (Place on touch) to aim down the barrel. Guns use lead shot: melt a cannonball into ten at the craft bench. A shot sets off a powder keg.' }));
    this.paper.append(h('h3', { text: 'Boarding other ships' }), h('p', { class: 'muted', text: 'Swim to any ship, or swing over on the grappling hook, and climb aboard. Her crew will fight: cut down the helmsman and she loses way, and mind the lookout’s musket up in the crow’s nest. Beat them all and break open the strongbox in her hold. Boarding a merchantman or the navy puts the navy on your trail.' }));
    this.paper.append(h('h3', { text: 'Loot' }), h('p', { class: 'muted', text: 'Gold and valuables you carry (goblets, pearls, rubies, idols) are lost if you die. Stow them in your ship’s hold, where they’re safe unless she sinks, and sell them to Old Mags when you bank. Hollowmen rise at night away from lantern light, and the Hollow Wake hunts anyone carrying cursed gold.' }));
    this.paper.append(h('h3', { text: 'Stuck?' }), h('p', { class: 'muted', text: 'Menu, I’m stuck, then stand still for seven seconds and you’re lifted out to open air.' }));
    this.paper.append(h('h3', { text: 'Music' }), h('p', { class: 'muted', text: 'The band follows your voyage: a shanty at the title, a jig under sail, a hornpipe ashore, a waltz after dark and a reel when a fight starts. Turn it off, or the volume down, in Settings.' }));
    this.paper.append(h('h3', { text: 'Sailing with friends' }), h('p', { class: 'muted', text: 'Open your voyage from Crew in the menu, and friends who have this page open can join your ship. One pirate steers at a time; whoever holds the wheel fires the broadsides with their own shot. Everyone keeps their own gold, gear and look, and takes them home when they leave.' }));
    this.paper.append(h('div', { class: 'row' }, this.btn('Back', () => { if (G.state === 'title') G.closeSheet(); else G.openSheet('menu'); }, 'btn ghost')));
  }

  // ---------------------------------------------------------------- captain and ship
  r_captain() {
    const G = this.g, L = G.look, tab = this.opts.tab || 'captain', fresh = !!this.opts.fresh;
    this.paper.append(this.head(fresh ? 'A new voyage' : 'Refit', tab === 'ship' ? 'Your ship' : 'Your captain', false));
    this.paper.append(this.tabs([['captain', 'Captain'], ['ship', 'Ship']], tab));
    const shipKeys = ['ship', 'sail', 'hull', 'emblem'];
    const upd = (k, v) => { L[k] = v; G.applyLook(shipKeys.includes(k) ? 'ship' : 'captain'); this.render(); };
    const form = h('div', { class: 'form' });
    if (tab === 'captain') {
      form.append(this.textField('Name', L.name, 24, (v) => { L.name = v || 'Captain'; G.ui.setCaptain(L); }));
      form.append(this.swatches('Skin', LOOKS.skin, L.skin, (i) => upd('skin', i)));
      form.append(this.swatches('Hair', LOOKS.hair, L.hair, (i) => upd('hair', i)));
      form.append(this.optRow('Beard', LOOKS.beard.map((b, i) => [i, b]), L.beard, (i) => upd('beard', i)));
      form.append(this.optRow('Hat', LOOKS.hat.map((b, i) => [i, b]), L.hat, (i) => upd('hat', i)));
      form.append(this.swatches('Coat', LOOKS.coat.map((c) => c.c), L.coat, (i) => upd('coat', i), LOOKS.coat.map((c) => c.name)));
      form.append(this.optRow('Eyes', [[false, 'Both eyes'], [true, 'Eye patch']], !!L.patch, (v) => upd('patch', v)));
      if (fresh) {
        if (this.opts.showGuide == null) this.opts.showGuide = true;
        form.append(this.check('Show the optional first-voyage guide', this.opts.showGuide, (v) => { this.opts.showGuide = v; }));
      }
    } else {
      form.append(this.textField('Ship name', L.ship, 26, (v) => { L.ship = v || 'The Salt Wren'; G.applyLook('ship'); }));
      form.append(this.swatches('Hull', LOOKS.hull.map((c) => c.c), L.hull, (i) => upd('hull', i), LOOKS.hull.map((c) => c.name)));
      form.append(this.swatches('Sails', LOOKS.sail.map((c) => c.c), L.sail, (i) => upd('sail', i), LOOKS.sail.map((c) => c.name)));
      form.append(this.optRow('Emblem', LOOKS.emblem.map((e, i) => [i, e]), L.emblem, (i) => upd('emblem', i)));
    }
    this.paper.append(form);
    if (fresh) this.paper.append(h('p', { class: 'muted', text: 'A new voyage replaces your autosave. Voyages saved in numbered slots are kept.' }));
    const row = h('div', { class: 'row stick' });
    row.append(this.btn('Shuffle', () => { const keep = { name: L.name, ship: L.ship }; Object.assign(L, randomLook(), keep); G.applyLook('all'); this.render(); }, 'btn ghost'));
    if (fresh) { row.append(this.btn('Back', () => G.closeSheet(), 'btn ghost'), this.btn('Set sail', () => G.beginVoyage(L, this.opts.showGuide))); }
    else row.append(this.btn('Done', () => { G.autosave('look', true); G.openSheet('menu'); }));
    this.paper.append(row);
  }

  // ---------------------------------------------------------------- the end
  r_ending() {
    const G = this.g, Q = G.quests, st = G.stats;
    this.paper.append(this.head('The curse is broken', 'Fair winds', false));
    this.paper.append(h('p', { text: `The Deep One is gone, and the Hollow Wake with it. Brine Haven will be telling stories about ${G.look.name} and ${G.look.ship} for a long time.` }));
    this.paper.append(h('div', { class: 'stats' },
      'Days at sea', h('b', { text: String(G.sky.day) }), 'Gold earned', h('b', { text: String(G.earned) }),
      'Chests dug up', h('b', { text: String(st.chests) }), 'Hollowmen put down', h('b', { text: String(st.kills) }),
      'Ghost ships sunk', h('b', { text: String(st.ships) }), 'Contracts done', h('b', { text: String(Q.stats.contracts) }),
      'Bottles found', h('b', { text: String(Q.stats.bottles) }), 'Blocks mined', h('b', { text: String(st.blocks) }), 'Blocks placed', h('b', { text: String(st.placed) })));
    this.paper.append(h('p', { class: 'muted', text: 'The archipelago is yours now. Contracts, storms and buried gold keep coming.' }));
    this.paper.append(h('div', { class: 'row' }, this.btn('Keep sailing', () => G.closeSheet())));
  }
}
