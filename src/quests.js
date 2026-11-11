import { W, D, SEA, B, ITEMS } from './config.js';
import { VESSELS, vesselProgress } from './shop.js';

const STORY = [
  { id: 'landfall', title: 'Landfall' },
  { id: 'firsthaul', title: 'First Haul' },
  { id: 'oil', title: 'Oil for the Lantern' },
  { id: 'bones', title: 'Bones on Saltbone Isle' },
  { id: 'log', title: 'The Captain’s Log' },
  { id: 'vault', title: 'The Hollow Vault' },
  { id: 'deep', title: 'The Deep One' },
  { id: 'home', title: 'Homecoming' },
  { id: 'free', title: 'Free Sailing' },
];
const NAMES = { mags: 'Old Mags', tallow: 'Brother Tallow' };
const LORE = [
  'Whoever finds this: the Hollow Wake only fires when you show her your side. Keep your bow on her.',
  'Day 41. The Hollowmen will not cross lantern light. Build bright, sleep easy.',
  'The tide keeps what the greedy drop. Bank your gold before the night does.',
  'Mags cheats at dice. I have no proof. Tell no one.',
  'Storms here come from nowhere and leave the same way. Patch your hull and ride it out.',
  'Under Marrow’s grin the vault sleeps. The captain wrote down the way and tore it in three.',
  'If you hear the deep water hum at night, sail for the lights of Brine Haven.',
  'Coconut oil, a plank frame and a little patience. That is a lantern.',
];

export class Quests {
  constructor(G) { this.g = G; this.reset(); }
  reset() {
    this.step = 0; this.phase = 0; this.flags = {};
    this.active = []; this.offers = { mags: [], tallow: [] }; this.nextId = 1;
    this.discovered = [0]; this.camps = {}; this.bottles = [];
    this.tracked = 'story'; this.offerDay = -1; this.bottleT = 25; this.discT = 0;
    this.storyChests = {}; this.huntTimers = {};
    this.stats = { contracts: 0, bottles: 0 };
    this.kraken = null;
  }
  get G() { return this.g; }
  get id() { return STORY[this.step].id; }
  get done() { return this.id === 'free'; }
  get chapter() { return STORY[this.step].title; }
  isl(name) { return this.g.world.islands.findIndex((o) => o.name === name); }
  iname(i) { return this.g.world.islands[i] ? this.g.world.islands[i].name : 'an island'; }
  has(item, n = 1) { return (this.g.inv[item] || 0) >= n; }
  give(item, n = 1) { this.g.inv[item] = (this.g.inv[item] || 0) + n; this.g.ui.pickup(`+${n} ${ITEMS[item].name}`); }
  take(item, n = 1) { this.g.inv[item] = Math.max(0, (this.g.inv[item] || 0) - n); }
  pay(n, why) { this.g.banked += n; this.g.earned = (this.g.earned || 0) + n; this.g.sfx.coin(); this.g.ui.toast(`+${n} gold`, why, 'good'); }

  // ---------------------------------------------------------------- setup and save
  init() {
    const site = this.g.world.sites.camp;
    if (site) this.camps.story = { id: 'story', island: site.island, x: site.x, z: site.z, y: site.y, fire: site.fire, total: 6, killed: 0, captainDead: false, active: false, cleared: false };
    this.fortCamp();
    this.refreshOffers(true);
  }
  // the garrison of Fort Brackwater: bones that stand their posts until their captain falls
  fortCamp() {
    const f = this.g.world.sites.fort;
    if (f && !this.camps.fort) this.camps.fort = { id: 'fort', island: f.island, x: f.x, z: f.z, y: f.y, fire: f.fire, total: 6, killed: 0, captainDead: false, active: true, cleared: false };
  }
  serialize() {
    const camps = {};
    for (const [k, c] of Object.entries(this.camps)) { const { spawned, ...rest } = c; camps[k] = rest; }
    return { step: this.step, phase: this.phase, flags: this.flags, active: this.active, offers: this.offers, nextId: this.nextId, discovered: this.discovered, camps, bottles: this.g.props.bottles.map((b) => ({ x: b.x, z: b.z, data: b.data })), tracked: this.tracked, offerDay: this.offerDay, storyChests: this.storyChests, stats: this.stats };
  }
  load(s) {
    this.reset();
    Object.assign(this, { step: s.step || 0, phase: s.phase || 0, flags: s.flags || {}, active: s.active || [], offers: s.offers || { mags: [], tallow: [] }, nextId: s.nextId || 1, discovered: s.discovered || [0], camps: s.camps || {}, tracked: s.tracked || 'story', offerDay: s.offerDay ?? -1, storyChests: s.storyChests || {}, stats: s.stats || { contracts: 0, bottles: 0 } });
    if (!this.camps.story) { const site = this.g.world.sites.camp; if (site) this.camps.story = { id: 'story', island: site.island, x: site.x, z: site.z, y: site.y, fire: site.fire, total: 6, killed: 0, captainDead: false, active: this.step >= 3, cleared: false }; }
    this.fortCamp();
    for (const b of s.bottles || []) this.g.props.spawnBottle(b.x, b.z, b.data);
  }

  // ---------------------------------------------------------------- per frame
  // islands come onto your chart as you pass them, even while sailing in someone else's crew
  chartNearby(dt) {
    const G = this.g, P = G.player;
    this.discT -= dt;
    if (this.discT > 0) return false;
    this.discT = 0.5;
    for (let i = 0; i < G.world.islands.length; i++) {
      if (this.discovered.includes(i)) continue;
      const o = G.world.islands[i];
      if (Math.hypot(P.pos.x - o.x, P.pos.z - o.z) < o.r + 30) {
        this.discovered.push(i);
        G.ui.toast('Charted', `${o.name} is on your map now.`, '');
        G.sfx.bell();
        G.ui.mapBase = null;
        for (const q of this.active) {
          if (q.kind === 'expedition' && q.state === 'active' && q.island === i) {
            q.state = 'ready';
            G.ui.toast('Expedition complete', `Report your findings from ${o.name} to ${NAMES[q.giver]}.`, 'good');
          }
        }
      }
    }
    return true;
  }
  update(dt) {
    const G = this.g, P = G.player;
    if (this.chartNearby(dt) && G.sky.day !== this.offerDay) this.refreshOffers(false);
    const st = this.id;
    if (st === 'landfall' && P.mode === 'helm') this.advance();
    if (st === 'deep' && this.phase === 0 && !G.kraken) {
      const spot = this.deepSpot();
      const s = G.sloop;
      if (s && !s.sinking && (P.mode === 'deck' || P.mode === 'helm') && Math.hypot(s.pos.x - spot.x, s.pos.z - spot.z) < 24 && G.sky.isNight) {
        this.phase = 1;
        G.startKraken();
      }
    }
    // bottles drift into reach now and then
    this.bottleT -= dt;
    if (this.bottleT <= 0) {
      this.bottleT = 70 + Math.random() * 60;
      const n = G.props.bottles.filter((b) => !b.data.story).length;
      if (n < 3) this.spawnBottle();
    }
    // hunt contracts: summon the ghost ship once the player is at sea
    for (const q of this.active) {
      if (q.kind === 'hunt' && q.state === 'active' && !q.spawned) {
        this.huntTimers[q.id] = (this.huntTimers[q.id] || 0) + dt;
        if (this.huntTimers[q.id] > 15 && (P.mode === 'helm' || P.mode === 'deck') && !G.hollowFor(q.id)) {
          if (G.spawnHollow({ huntId: q.id })) { q.spawned = true; G.ui.toast('Black sails', 'The Hollow Wake answers Tallow’s bounty. Sink her.', 'curse'); }
        }
      }
      if (q.kind === 'supply' && q.state === 'active' && this.has(q.item, q.need)) { q.state = 'ready'; G.ui.pickup(`${q.title}: ready to hand in`); }
      if (q.kind === 'supply' && q.state === 'ready' && !this.has(q.item, q.need)) q.state = 'active';
      if (q.kind === 'explore' && q.state === 'active' && this.discovered.length >= G.world.islands.length) { q.state = 'ready'; G.ui.toast('Every island charted', 'Show your chart to Old Mags.', 'good'); }
    }
  }
  deepSpot() {
    if (this.flags.deep) return this.flags.deep;
    const G = this.g, mc = G.world.islands.find((o) => o.type === 'skull') || G.world.islands[0];
    let best = null;
    for (let a = -1.2; a <= 1.2; a += 0.2) for (let r = mc.r + 14; r < mc.r + 70; r += 4) {
      const x = mc.x + Math.cos(a) * r, z = mc.z + Math.sin(a) * r;
      if (x < 24 || z < 24 || x > W - 24 || z > D - 24) continue;
      let ok = true;
      for (let dx = -12; dx <= 12 && ok; dx += 4) for (let dz = -12; dz <= 12 && ok; dz += 4) if (G.world.surf[Math.floor(x + dx) + Math.floor(z + dz) * W] > SEA - 4) ok = false;
      if (ok) { best = { x: Math.round(x), z: Math.round(z) }; break; }
    }
    this.flags.deep = best || { x: Math.round(mc.x + mc.r + 50), z: Math.round(mc.z) };
    return this.flags.deep;
  }
  spawnBottle(data) {
    const G = this.g, P = G.player;
    for (let t = 0; t < 60; t++) {
      const a = Math.random() * Math.PI * 2, r = 35 + Math.random() * 70;
      const d = data && data.near ? data.near.r * 1.2 + 10 + Math.random() * 20 : 0;
      const x = data && data.near ? data.near.x + Math.cos(a) * d : P.pos.x + Math.cos(a) * r;
      const z = data && data.near ? data.near.z + Math.sin(a) * d : P.pos.z + Math.sin(a) * r;
      if (x < 20 || z < 20 || x > W - 20 || z > D - 20) continue;
      if (G.world.surf[Math.floor(x) + Math.floor(z) * W] > SEA - 3) continue;
      G.props.spawnBottle(x, z, data || this.rollBottle());
      return true;
    }
    return false;
  }
  rollBottle() {
    const r = Math.random();
    if (r < 0.45) return { kind: 'chart' };
    if (r < 0.75) return { kind: 'gold', n: 20 + ((Math.random() * 35) | 0), lore: LORE[(Math.random() * LORE.length) | 0] };
    return { kind: 'lore', lore: LORE[(Math.random() * LORE.length) | 0] };
  }
  onBottle(b) {
    const G = this.g;
    this.stats.bottles++;
    G.sfx.coin();
    if (b.story) {
      this.give('page2');
      G.ui.toast('A message in a bottle', 'A torn page from the Hollow captain’s log. Page II.', 'curse');
      return;
    }
    if (b.kind === 'chart') {
      if (this.active.length < 3) {
        const q = this.makeChart('bottle', true);
        this.active.push(q);
        G.ui.toast('A torn treasure chart', `It shows part of ${this.iname(q.island)}. Search the circle for the X.`, 'good');
      } else { G.gold += 30; G.ui.toast('A message in a bottle', 'An old chart, too faded to read. A few coins rattle out. +30 gold.', ''); }
    } else if (b.kind === 'gold') {
      G.gold += b.n;
      G.ui.toast('A message in a bottle', `“${b.lore}”  +${b.n} gold`, '');
    } else {
      G.ui.toast('A message in a bottle', `“${b.lore}”`, '');
      G.inv.ball = (G.inv.ball || 0) + 3;
    }
  }

  // ---------------------------------------------------------------- story flow
  advance() {
    this.step = Math.min(STORY.length - 1, this.step + 1);
    this.phase = 0;
    const G = this.g;
    const id = this.id;
    G.sfx.bell();
    if (id === 'firsthaul') G.ui.toast('Chapter: First Haul', `Dig up the X on ${this.iname(G.world.firstMap.island)}, then bank the gold with Old Mags.`, 'chapter');
    if (id === 'oil') G.ui.toast('Chapter: Oil for the Lantern', 'Old Mags has a job for you at the trading post.', 'chapter');
    if (id === 'bones') {
      if (this.camps.story) this.camps.story.active = true;
      G.ui.toast('Chapter: Bones on Saltbone Isle', 'Brother Tallow wants the Hollowmen camp on Saltbone Isle destroyed.', 'chapter');
    }
    if (id === 'log') {
      const ws = this.isl('Widow’s Shoal'), kr = this.isl('Kettle Rock');
      const o = G.world.islands[ws >= 0 ? ws : 1];
      this.spawnBottle({ story: true, kind: 'story', near: { x: o.x, z: o.z, r: o.r } });
      const t = G.world.placeTreasure(Math.random, kr >= 0 ? kr : 2, true);
      this.storyChests[t.x + ',' + t.z] = 'page3';
      this.flags.page3 = { x: t.x, z: t.z, island: t.island, cx: t.x + Math.round((Math.random() - 0.5) * 14), cz: t.z + Math.round((Math.random() - 0.5) * 14) };
      G.ui.toast('Chapter: The Captain’s Log', 'One page drifts off Widow’s Shoal. Another is buried on Kettle Rock.', 'chapter');
    }
    if (id === 'vault') G.ui.toast('Chapter: The Hollow Vault', 'Dig beneath the beast’s skull on Marrow Cay.', 'chapter');
    if (id === 'deep') { this.deepSpot(); G.ui.toast('Chapter: The Deep One', 'Sail to the deep water east of Marrow Cay after dark.', 'chapter'); }
    if (id === 'home') G.ui.toast('Chapter: Homecoming', 'Bring the kraken pearl home to Old Mags.', 'chapter');
    if (id === 'free') G.showEnding();
    G.autosave('chapter');
  }
  storyObjective() {
    const G = this.g, P = G.player;
    const id = this.id, ph = this.phase;
    const fm = G.world.firstMap;
    switch (id) {
      case 'landfall':
        if (G.stats.wood < 3) return { text: G.isTouch ? 'Hold Hit on a tree trunk to gather 3 wood' : 'Hold left click on a tree trunk to gather 3 wood' };
        if (G.stats.crafted < 1) return { text: G.isTouch ? 'Open the Bag and craft planks from wood' : 'Press Tab and craft planks from wood' };
        return { text: 'Walk the pier, board your sloop, and take the helm', marker: G.sloop ? { x: G.sloop.pos.x, z: G.sloop.pos.z, icon: 'ship' } : null };
      case 'firsthaul':
        if (ph === 0) return { text: `Sail to the X on ${this.iname(fm.island)} and dig straight down`, marker: { x: fm.x + 0.5, z: fm.z + 0.5, icon: 'x' } };
        return { text: 'Bank the cursed gold with Old Mags at Brine Haven', marker: this.npcMarker('mags') };
      case 'oil':
        if (ph === 0) return { text: 'Talk to Old Mags at the trading post', marker: this.npcMarker('mags') };
        return { text: 'Deliver the lamp oil to Brother Tallow on Lantern Cay', marker: this.npcMarker('tallow') };
      case 'bones': {
        const c = this.camps.story;
        if (ph === 0) return { text: `Destroy the Hollowmen camp on Saltbone Isle (${c ? c.killed : 0}/${c ? c.total : 6})`, marker: c ? { x: c.x, z: c.z, icon: 'skull' } : null };
        return { text: 'Bring the captain’s skull to Brother Tallow', marker: this.npcMarker('tallow') };
      }
      case 'log': {
        const need = ['page1', 'page2', 'page3'].filter((p) => !this.has(p));
        if (!need.length) return { text: 'Bring the three log pages to Brother Tallow', marker: this.npcMarker('tallow') };
        if (need.includes('page2')) { const b = G.props.bottles.find((x) => x.data.story); if (b) return { text: `Find the drifting bottle near Widow’s Shoal (${3 - need.length}/3 pages)`, marker: { x: b.x, z: b.z, icon: 'bottle' } }; }
        if (need.includes('page3') && this.flags.page3) { const f = this.flags.page3; return { text: `Dig for the buried page on Kettle Rock (${3 - need.length}/3 pages)`, marker: { x: f.cx, z: f.cz, icon: 'x', r: 12 } }; }
        if (need.includes('page1')) return { text: 'The first page was on the skeleton captain. Ask Brother Tallow.', marker: this.npcMarker('tallow') };
        return { text: 'Find the missing log pages' };
      }
      case 'vault': {
        const v = G.world.sites.vault;
        if (ph === 0) return { text: 'Dig into the Hollow vault beneath the beast’s skull on Marrow Cay', marker: v ? { x: v.x + 0.5, z: v.z + 0.5, icon: 'vault' } : null };
        if (ph === 1) { const h = G.hollows.find((s) => s.variant === 'flagship' && !s.sinking); return { text: 'Sink the Hollow Wake’s flagship', marker: h ? { x: h.pos.x, z: h.pos.z, icon: 'enemy' } : null }; }
        return { text: 'Show the Heart of the Hollow to Brother Tallow', marker: this.npcMarker('tallow') };
      }
      case 'deep': {
        const s = this.deepSpot();
        if (ph === 0) return { text: G.sky.isNight ? 'Sail to the deep water east of Marrow Cay' : 'Sail to the deep water east of Marrow Cay. It wakes after dark', marker: { x: s.x, z: s.z, icon: 'deep' } };
        return { text: 'Destroy the Deep One’s tentacles, then strike its eye' };
      }
      case 'home': return { text: 'Bring the kraken pearl home to Old Mags', marker: this.npcMarker('mags') };
      default: return { text: 'Take contracts from Old Mags and Brother Tallow' };
    }
  }
  shipyardObjective() {
    const G = this.g;
    if (!this.flags.shipwrightIntro) {
      return { title: 'The Shipwright’s Wager', id: 'shipwright', text: 'Talk to Old Mags after your first treasure haul to hear how the shipyard can be reopened' };
    }
    const next = VESSELS.find((vessel) => !G.ownedShips[vessel.id]);
    if (!next) return { title: 'The Shipwright’s Legacy', id: 'shipwright', text: 'You have earned every hull in Old Mags’ fleet. The next voyage is yours to write' };
    const progress = vesselProgress(G, next);
    const tales = {
      cutter: 'Mags will stake her name on a swift cutter for a captain who can make their mark',
      brigantine: 'The old slip can launch a brigantine once your cutter has proven itself',
      frigate: 'A frigate needs a proven captain, a deep purse, and a crew who trust your colors',
    };
    const qualified = progress.unlocked && G.ownedShips[next.requires];
    return {
      title: `${next.name} commission`,
      id: 'shipwright',
      text: `${tales[next.id]} ${qualified ? `Its charter is earned; save ${next.price} banked gold to commission it` : `Choose any route: ${progress.text}. One completed route earns its charter`}`,
    };
  }
  npcMarker(id) { const n = this.g.npcs.get(id); return n ? { x: n.site.x, z: n.site.z, icon: 'npc' } : null; }

  // ---------------------------------------------------------------- contracts
  level() { return this.g.level; }
  makeChart(giver, torn) {
    const G = this.g;
    const isl = G.world.pickTreasureIsland(Math.random, -1, false);
    const t = G.world.placeTreasure(Math.random, isl, true);
    const q = { id: 'q' + this.nextId++, kind: 'chart', giver, island: isl, x: t.x, z: t.z, y: t.y, torn, cursed: Math.random() < 0.45, state: 'active', title: torn ? `Torn chart: ${this.iname(isl)}` : `Treasure chart: ${this.iname(isl)}` };
    if (torn) { q.cx = t.x + Math.round((Math.random() - 0.5) * 16); q.cz = t.z + Math.round((Math.random() - 0.5) * 16); }
    return q;
  }
  genOffer(npc) {
    const L = this.level();
    const pick = (a) => a[(Math.random() * a.length) | 0];
    const oid = 'o' + this.nextId++;
    const frontier = this.g.world.islands.map((island, i) => ({ island, i })).filter(({ island, i }) =>
      island.frontier && !this.discovered.includes(i) && !(this.flags.expeditionsComplete || {})[island.name]
      && !this.active.some((q) => q.kind === 'expedition' && q.island === i));
    const expedition = () => {
      const { island, i } = pick(frontier);
      const note = island.type === 'atoll' ? 'Old Mags wants you to find a calm anchorage beyond the known chart.'
        : island.type === 'rock' || island.type === 'volcano' ? 'Brother Tallow needs a safe approach marked around the outer rocks.'
          : island.type === 'cove' || island.type === 'sandbar' ? 'Old Mags heard sailors have been hiding along this remote shore.'
            : 'Brother Tallow wants a fresh report from the islands beyond the old sailing routes.';
      return { oid, kind: 'expedition', giver: npc, island: i, title: `Outer Reach: ${island.name}`, desc: note, reward: 180 + L * 20 };
    };
    if (npc === 'mags') {
      const kinds = ['chart', 'chart', 'supply', 'rum'];
      if (!this.flags.exploreOffered && this.discovered.length < this.g.world.islands.length) kinds.push('explore');
      if (frontier.length) kinds.push('expedition');
      const k = pick(kinds);
      if (k === 'chart') { const torn = Math.random() < 0.5; return { oid, kind: 'chart', giver: npc, torn, title: torn ? 'A torn treasure chart' : 'A treasure chart', desc: torn ? 'Only part of the island survives on this one. Search the circle for the red X.' : 'A clean chart with the X marked. Dig it up and bank what you find.', reward: 'Chest gold' }; }
      if (k === 'supply') {
        const item = pick(['plank', 'stone', 'coconut', 'brick', 'wood']);
        const need = { plank: 16, stone: 12, coconut: 6, brick: 10, wood: 10 }[item];
        return { oid, kind: 'supply', giver: npc, item, need, title: `Supply order: ${need} ${ITEMS[item].name.toLowerCase()}`, desc: 'The trading post is running low. Bring the goods and I pay on the nail.', reward: 90 + L * 12 };
      }
      if (k === 'explore') return { oid, kind: 'explore', giver: npc, title: 'Chart the Brine', desc: 'Sail close to every island in the archipelago so your chart is complete.', reward: 300 };
      if (k === 'expedition') return expedition();
      return { oid, kind: 'delivery', giver: npc, cargo: 'rum', to: 'tallow', title: 'Rum for the lighthouse', desc: 'Brother Tallow says it’s for the lamps. Deliver the barrel to Lantern Cay and don’t drink it.', reward: 140 + L * 15 };
    }
    const kinds = ['bounty', 'bounty', 'hunt', 'candles', 'bones'];
    if (frontier.length) kinds.push('expedition');
    const k = pick(kinds);
    if (k === 'expedition') return expedition();
    if (k === 'bounty') {
      const choices = this.g.world.islands.map((o, i) => i).filter((i) => i !== 0 && this.g.world.islands[i].name !== 'Lantern Cay' && !['volcano', 'sandbar', 'atoll'].includes(this.g.world.islands[i].type) && !Object.values(this.camps).some((c) => c.island === i && !c.cleared));
      const isl = choices.length ? pick(choices) : 1;
      return { oid, kind: 'bounty', giver: npc, island: isl, title: `Bounty: Hollowmen on ${this.iname(isl)}`, desc: 'A new camp has risen. Put down their captain and the rest will crumble.', reward: 220 + L * 25 };
    }
    if (k === 'hunt') return { oid, kind: 'hunt', giver: npc, title: 'Sink the Hollow Wake', desc: 'Raise your sails and she will come for you. Send her back to the deep.', reward: 260 + L * 25 };
    if (k === 'bones') return { oid, kind: 'supply', giver: npc, item: 'bone', need: 8, title: 'Bones for the candles', desc: 'Hollowmen bones burn bright and long. Bring me eight.', reward: 110 + L * 12 };
    return { oid, kind: 'delivery', giver: npc, cargo: 'candles', to: 'mags', title: 'Candles for Brine Haven', desc: 'Old Mags trades these for oil. Carry the box safely across.', reward: 130 + L * 15 };
  }
  // a fresh offer that does not repeat one already on that board
  freshOffer(npc, list) {
    let o = null;
    for (let tries = 0; tries < 24; tries++) {
      o = this.genOffer(npc);
      const clash = list.some((x) => x.title === o.title || (x.kind === o.kind && (o.kind === 'explore' || o.kind === 'hunt')));
      const busy = (o.kind === 'explore' && this.active.some((q) => q.kind === 'explore')) || (o.kind === 'hunt' && this.active.some((q) => q.kind === 'hunt'))
        || (o.kind === 'expedition' && this.active.some((q) => q.kind === 'expedition' && q.island === o.island));
      if (!clash && !busy) return o;
    }
    return o;
  }
  refreshOffers(force) {
    const G = this.g;
    this.offerDay = G.sky.day;
    for (const npc of ['mags', 'tallow']) { const list = []; for (let i = 0; i < 3; i++) list.push(this.freshOffer(npc, list)); this.offers[npc] = list; }
    if (!force) G.ui.pickup('New contracts on the boards');
  }
  accept(npc, oid) {
    const G = this.g;
    if (this.active.length >= 3) { G.ui.toast('Too many contracts', 'Finish or abandon one first. You can hold three.', 'bad'); return false; }
    const o = this.offers[npc].find((x) => x.oid === oid);
    if (!o) return false;
    let q = null;
    if (o.kind === 'chart') q = this.makeChart(npc, o.torn);
    else if (o.kind === 'bounty') {
      const camp = G.world.buildCamp(o.island, Math.random, true);
      const id = 'c' + this.nextId++;
      this.camps[id] = { id, island: o.island, x: camp.x, z: camp.z, y: camp.y, fire: camp.fire, total: 4 + Math.min(4, this.level()), killed: 0, captainDead: false, active: true, cleared: false };
      q = { id: 'q' + this.nextId++, kind: 'bounty', giver: npc, camp: id, island: o.island, title: o.title, reward: o.reward, state: 'active' };
      this.camps[id].quest = q.id;
    } else if (o.kind === 'delivery') {
      q = { id: 'q' + this.nextId++, kind: 'delivery', giver: npc, cargo: o.cargo, to: o.to, title: o.title, reward: o.reward, state: 'active' };
      this.give(o.cargo);
    } else {
      q = { id: 'q' + this.nextId++, ...o, state: 'active' };
      delete q.oid; delete q.desc;
      if (o.kind === 'explore') this.flags.exploreOffered = true;
      if (o.kind === 'expedition' && this.discovered.includes(o.island)) q.state = 'ready';
    }
    if (o.kind !== 'chart') q.reward = o.reward;
    this.active.push(q);
    if (this.tracked === 'story' && this.done) this.tracked = q.id;
    this.offers[npc] = this.offers[npc].filter((x) => x.oid !== oid);
    this.offers[npc].push(this.freshOffer(npc, this.offers[npc]));
    G.sfx.place();
    return true;
  }
  abandon(id) {
    const q = this.active.find((x) => x.id === id);
    if (!q) return;
    if (q.kind === 'delivery') this.take(q.cargo);
    if (q.kind === 'bounty' && this.camps[q.camp]) this.camps[q.camp].active = false;
    this.active = this.active.filter((x) => x.id !== id);
    if (this.tracked === id) this.tracked = 'story';
  }
  turnIn(id, npc) {
    const G = this.g;
    const q = this.active.find((x) => x.id === id);
    if (!q) return;
    if (q.kind === 'expedition') {
      if (q.state !== 'ready') return;
      const island = G.world.islands[q.island];
      if (island) {
        this.flags.expeditionsComplete = this.flags.expeditionsComplete || {};
        this.flags.expeditionsComplete[island.name] = true;
      }
    }
    if (q.kind === 'supply') { if (!this.has(q.item, q.need)) return; this.take(q.item, q.need); }
    if (q.kind === 'delivery') { if (!this.has(q.cargo)) return; this.take(q.cargo); }
    this.active = this.active.filter((x) => x.id !== id);
    if (this.tracked === id) this.tracked = 'story';
    this.stats.contracts++; G.level++;
    this.pay(q.reward, `${NAMES[npc]} pays for “${q.title}”.`);
    G.autosave('contract');
  }
  contractObjective(q) {
    const G = this.g;
    switch (q.kind) {
      case 'chart': return q.torn ? { text: `Search the circle on ${this.iname(q.island)} for the red X`, marker: { x: q.cx, z: q.cz, icon: 'x', r: 12 } } : { text: `Dig at the X on ${this.iname(q.island)}`, marker: { x: q.x + 0.5, z: q.z + 0.5, icon: 'x' } };
      case 'supply': return q.state === 'ready' ? { text: `Hand ${q.need} ${ITEMS[q.item].name.toLowerCase()} to ${NAMES[q.giver]}`, marker: this.npcMarker(q.giver) } : { text: `Gather ${ITEMS[q.item].name.toLowerCase()}: ${Math.min(q.need, G.inv[q.item] || 0)}/${q.need}` };
      case 'delivery': return this.has(q.cargo) ? { text: `Deliver the ${ITEMS[q.cargo].name.toLowerCase()} to ${NAMES[q.to]}`, marker: this.npcMarker(q.to) } : { text: 'The cargo is lost. Abandon the contract.' };
      case 'bounty': { const c = this.camps[q.camp]; if (q.state === 'ready') return { text: `Claim the bounty from ${NAMES[q.giver]}`, marker: this.npcMarker(q.giver) }; return { text: `Defeat the Hollowmen captain on ${this.iname(q.island)}`, marker: c ? { x: c.x, z: c.z, icon: 'skull' } : null }; }
      case 'hunt': { if (q.state === 'ready') return { text: `Claim the bounty from ${NAMES[q.giver]}`, marker: this.npcMarker(q.giver) }; const h = G.hollowFor(q.id); return { text: h ? 'Sink the Hollow Wake' : 'Take your sloop out to open water', marker: h ? { x: h.pos.x, z: h.pos.z, icon: 'enemy' } : null }; }
      case 'explore': { if (q.state === 'ready') return { text: 'Show your finished chart to Old Mags', marker: this.npcMarker('mags') }; return { text: `Chart every island: ${this.discovered.length}/${G.world.islands.length}`, marker: this.nearestUncharted() }; }
      case 'expedition': { const island = G.world.islands[q.island]; if (q.state === 'ready') return { text: `Report your findings from ${island ? island.name : 'the outer island'} to ${NAMES[q.giver]}`, marker: this.npcMarker(q.giver) }; return { text: `Sail close to ${island ? island.name : 'the marked island'} to chart it`, marker: island ? { x: island.x, z: island.z, icon: 'chart' } : null }; }
      default: return { text: q.title };
    }
  }
  nearestUncharted() {
    const G = this.g, P = G.player;
    let best = null;
    G.world.islands.forEach((o, i) => { if (this.discovered.includes(i)) return; const d = Math.hypot(o.x - P.pos.x, o.z - P.pos.z); if (!best || d < best.d) best = { d, x: o.x, z: o.z, icon: 'chart' }; });
    return best;
  }
  tracked_() {
    const crew = this.g.net && this.g.net.crewObjective();
    if (crew) return crew;
    if (this.tracked === 'shipwright' && this.flags.shipwrightIntro) return this.shipyardObjective();
    if (this.tracked !== 'story') { const q = this.active.find((x) => x.id === this.tracked); if (q) return { title: q.title, ...this.contractObjective(q), id: q.id }; this.tracked = 'story'; }
    return { title: STORY[this.step].title, ...this.storyObjective(), id: 'story' };
  }
  markers() {
    const crew = this.g.net && this.g.net.crewMarkers();
    if (crew) return crew.map((m) => ({ ...m }));
    const out = [];
    const t = this.tracked_();
    const s = this.storyObjective();
    if (s.marker) out.push({ ...s.marker, tracked: t.id === 'story' });
    for (const q of this.active) { const o = this.contractObjective(q); if (o.marker) out.push({ ...o.marker, tracked: t.id === q.id }); }
    return out;
  }
  campList() { return Object.values(this.camps); }
  activeCamps() { return Object.values(this.camps).filter((c) => c.active && !c.cleared); }

  // ---------------------------------------------------------------- game events
  onChestOpened(x, y, z) {
    const G = this.g;
    const key = x + ',' + z;
    const fm = G.world.firstMap;
    if (this.id === 'firsthaul' && this.phase === 0 && fm.x === x && fm.z === z) {
      this.phase = 1; fm.dug = true;
      return { gold: 120 + ((Math.random() * 31) | 0), cursed: true, story: true };
    }
    if (this.storyChests[key] === 'page3') {
      delete this.storyChests[key];
      this.give('page3');
      G.ui.toast('A buried page', 'Page III of the Hollow captain’s log, wrapped in oilcloth.', 'curse');
      return { gold: 40, cursed: false, story: true };
    }
    const q = this.active.find((c) => c.kind === 'chart' && c.x === x && c.z === z);
    if (q) {
      this.active = this.active.filter((c) => c !== q);
      if (this.tracked === q.id) this.tracked = 'story';
      this.stats.contracts++;
      return { gold: 110 + this.level() * 40 + ((Math.random() * 40) | 0), cursed: q.cursed };
    }
    return null;
  }
  onVaultOpened() {
    const G = this.g;
    if (this.id === 'vault' && this.phase === 0) {
      this.phase = 1;
      this.give('heart');
      G.gold += 500;
      G.ui.toast('The Hollow vault', '+500 gold and a black stone that beats like a heart. The sea answers.', 'curse');
      G.sfx.curse();
      G.after(6, () => { if (G.spawnHollow({ variant: 'flagship' })) G.ui.toast('The flagship rises', 'The Hollow Wake’s flagship comes for its heart.', 'curse'); });
      return true;
    }
    G.gold += 60;
    G.ui.toast('An empty vault', 'Only a few coins left in the dust. +60 gold.', '');
    return true;
  }
  onSkeletonKilled(sk) {
    const G = this.g;
    const camp = sk.campId ? this.camps[sk.campId] : null;
    if (!camp) return;
    camp.killed++;
    if (sk.captain) {
      camp.captainDead = true;
      if (camp.id === 'story' && this.id === 'bones') {
        this.give('skull'); this.give('page1');
        this.phase = 1;
        G.ui.toast('The captain falls', 'You take his skull and a torn log page from his coat.', 'curse');
      } else {
        const q = this.active.find((c) => c.kind === 'bounty' && c.camp === camp.id);
        if (q) { q.state = 'ready'; G.ui.toast('Bounty complete', `Return to ${NAMES[q.giver]} for your pay.`, 'good'); }
      }
      for (const s of G.enemies.list) if (s.campId === camp.id && s !== sk) s.die(false);
      camp.cleared = true;
      if (camp.id === 'fort') G.ui.toast('Fort Brackwater falls', 'The garrison’s pay chest waits in the keep. Mind the powder kegs.', 'good');
    }
  }
  onShipSunk(ship) {
    const G = this.g;
    if (ship.variant === 'flagship' && this.id === 'vault' && this.phase === 1) { this.phase = 2; G.ui.toast('The flagship is sunk', 'Take the Heart to Brother Tallow.', 'chapter'); }
    if (ship.huntId) { const q = this.active.find((c) => c.id === ship.huntId); if (q) { q.state = 'ready'; G.ui.toast('Bounty complete', 'Brother Tallow will pay for this.', 'good'); } }
  }
  onBank(amount) { if (this.id === 'firsthaul' && this.phase === 1 && amount > 0) this.advance(); }
  onPlayerDeath() {
    const G = this.g;
    let lost = [];
    for (const c of ['oil', 'rum', 'candles']) if (G.inv[c] > 0) { lost.push(ITEMS[c].name.toLowerCase()); G.inv[c] = 0; }
    if (this.id === 'oil' && this.phase === 1) this.phase = 0;
    for (const q of this.active) if (q.kind === 'delivery') q.state = 'lost';
    if (lost.length) G.ui.toast('Cargo lost', `The sea took your ${lost.join(' and ')}.`, 'bad');
  }
  onKrakenDefeated() {
    const G = this.g;
    if (this.id === 'deep') {
      this.give('pearl');
      G.gold += 700;
      G.ui.toast('The Deep One is slain', '+700 gold from its hoard, and a pearl the size of a fist.', 'chapter');
      this.advance();
    }
  }
  onKrakenFled() { if (this.id === 'deep') { this.phase = 0; this.g.ui.toast('The Deep One sinks away', 'Patch your hull and try again after dark.', 'bad'); } }

  // ---------------------------------------------------------------- dialogs
  dialog(npc) {
    const G = this.g, st = this.id, ph = this.phase;
    const name = G.look.name;
    const d = { npc, greeting: '', story: null, shipwright: null, ready: [], offers: [], bank: npc === 'mags' && (G.gold > 0 || G.lootValue(G.inv) > 0), shop: npc === 'mags', rest: null };
    if (npc === 'mags') {
      d.greeting = G.sky.isNight ? `Up late, ${name}? The Hollowmen walk at night. Keep to the lantern light.` : `Ahoy, ${name}. Gold is safer in my strongbox than in your pockets.`;
      if (st === 'landfall') d.greeting = `So you’re the new captain. Chop some wood, craft planks, then take that sloop out. I marked an X for you on ${this.iname(G.world.firstMap.island)}.`;
      if (st === 'firsthaul') d.greeting = ph === 0 ? `That X on ${this.iname(G.world.firstMap.island)} won’t dig itself. Gold first, then we talk.` : 'You found it! Hand it over before the Hollow Wake smells it on you.';
      if (st === 'oil' && ph === 0) d.story = { text: 'Brother Tallow has kept the Lantern Cay light for forty years, and he’s out of oil. Take him this crate. The light keeps the Hollowmen honest.', button: 'Take the crate of lamp oil', act: () => { this.give('oil'); this.phase = 1; } };
      if (st === 'home' && this.has('pearl')) d.story = { text: 'Is that... the pearl? Then the Deep One is gone, and the curse with it. I never thought I’d see the day.', button: 'Give Old Mags the kraken pearl', act: () => { this.take('pearl'); this.pay(800, 'Old Mags trades the pearl for 800 gold.'); this.advance(); } };
      if (this.step >= 2) {
        d.shipwright = this.flags.shipwrightIntro
          ? { text: this.shipyardObjective().text, button: 'Visit the shipyard', act: () => G.openSheet('shop', { npc: 'mags' }) }
          : {
            text: 'Mags once lost her brother’s cutter to the Hollow Wake. She has kept the shipwright’s slip closed ever since. Prove your captaincy through the story, contracts, exploration, or combat, and she will vouch for a stronger hull.',
            button: 'Take the Shipwright’s Wager',
            act: () => { this.flags.shipwrightIntro = true; this.tracked = 'shipwright'; G.sfx.bell(); G.ui.toast('The Shipwright’s Wager', 'Story, contracts, exploration, or combat can each earn a ship charter.', 'chapter'); G.autosave('shipwright', true); },
          };
      }
      d.rest = G.sky.isNight ? { label: 'Rest until morning', act: () => G.skipTo('day') } : null;
    } else {
      d.greeting = this.flags.lit ? `The light holds, ${name}. Bless your oil.` : 'The lamp is cold. Without oil, the dead wander closer every night.';
      if (st === 'oil' && ph === 1 && this.has('oil')) d.story = { text: 'Oil! Bless you, and bless that crooked old quartermaster. Help me light the lamp.', button: 'Hand over the lamp oil', act: () => { this.take('oil'); this.flags.lit = true; this.pay(120, 'Brother Tallow lights the lighthouse.'); this.advance(); } };
      if (st === 'bones' && ph === 0) d.greeting = 'Now that the light burns, I can see them. A Hollowmen camp on Saltbone Isle, led by one of the old crew. Put him down and bring me his skull.';
      if (st === 'bones' && ph === 1 && this.has('skull')) d.story = { text: 'His skull, and a page of his log. The Hollow captain kept a careful book. There were three pages; find the others.', button: 'Hand over the captain’s skull', act: () => { this.take('skull'); this.pay(200, 'Brother Tallow pays the bounty.'); this.advance(); } };
      if (st === 'log') {
        const all = this.has('page1') && this.has('page2') && this.has('page3');
        d.greeting = all ? 'Three pages. Let me read them.' : 'The captain tore his log in three. One page drifts off Widow’s Shoal; one lies buried on Kettle Rock. The first you already carry.';
        if (all) d.story = { text: '“Beneath the grinning beast on Marrow Cay we sealed the vault, and our hearts with it.” The Hollow Wake’s treasure lies under that skull.', button: 'Give Brother Tallow the log pages', act: () => { this.take('page1'); this.take('page2'); this.take('page3'); this.pay(150, 'Brother Tallow pays for the pages.'); this.advance(); } };
      }
      if (st === 'vault') d.greeting = ph === 0 ? 'Dig under the beast’s skull on Marrow Cay. Whatever is down there, the Hollow Wake will come for it.' : ph === 1 ? 'Sink that flagship before it sinks you!' : 'You have it? Show me.';
      if (st === 'vault' && ph === 2 && this.has('heart')) d.story = { text: 'The Heart of the Hollow. It still beats. Something in the deep is tied to it. Take it east of Marrow Cay after dark, and end this.', button: 'I will take it to the deep', act: () => this.advance() };
      if (st === 'deep') d.greeting = 'East of Marrow Cay, in the deep water, after dark. Bring cannonballs. Many cannonballs.';
      if (st === 'home' || st === 'free') d.greeting = `The light burns, the sea is quiet. You did that, ${name}.`;
      d.rest = !G.sky.isNight ? { label: 'Rest until nightfall', act: () => G.skipTo('night') } : null;
      if (this.step < 3) { d.offers = []; }
    }
    for (const q of this.active) {
      const here = (q.kind === 'delivery' && q.to === npc && this.has(q.cargo)) || (q.giver === npc && q.state === 'ready');
      if (here) d.ready.push(q);
    }
    if (npc === 'mags' || this.step >= 3) d.offers = this.offers[npc];
    return d;
  }
}
