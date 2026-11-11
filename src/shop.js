// Old Mags' trading post: permanent upgrades and supplies, paid from banked gold.
export const UPGRADES = [
  { id: 'hull1', name: 'Oak-ribbed hull', desc: 'Adds 40 hull strength to every boat you sail.', price: 250 },
  { id: 'hull2', name: 'Iron-banded hull', desc: 'Adds 50 more hull strength to every boat you sail.', price: 600, req: 'hull1' },
  { id: 'sails1', name: 'Fresh canvas', desc: 'Every boat you sail moves 12% faster.', price: 220 },
  { id: 'sails2', name: 'Silk-weave sails', desc: 'Another 13% speed for every boat you sail.', price: 550, req: 'sails1' },
  { id: 'guns', name: 'Third cannon', desc: 'Raises your broadside to three guns where the hull allows.', price: 450, reqVessel: 'cutter' },
  { id: 'reload', name: 'Drilled gun crew', desc: 'Your cannons reload 25% faster.', price: 300 },
  { id: 'rudder', name: 'Balanced rudder', desc: 'Every boat you sail turns 15% tighter.', price: 500, reqVessel: 'cutter' },
  { id: 'keel', name: 'Copper-sheathed keel', desc: 'Your hull takes 15% less damage.', price: 800, reqVessel: 'brigantine' },
  { id: 'coat', name: 'Sea-wolf coat', desc: 'Your health rises from 100 to 130.', price: 280 },
  { id: 'pick', name: 'Steel pickaxe', desc: 'Mine stone and brick 60% faster.', price: 160 },
];
export const VESSELS = [
  { id: 'cutter', name: 'Cutter', price: 700, requires: 'sloop', paths: { story: 2, contracts: 3, islands: 8, ships: 2 }, desc: 'A quick, nimble hull for scouting and running down raiders.' },
  { id: 'brigantine', name: 'Brigantine', price: 1800, requires: 'cutter', paths: { story: 4, contracts: 8, islands: 20, ships: 6 }, desc: 'A two-masted, well-armed ship built for long crossings.' },
  { id: 'frigate', name: 'Frigate', price: 4200, requires: 'brigantine', paths: { story: 7, contracts: 15, islands: 34, ships: 12 }, desc: 'A stout warship with a heavy broadside and a deep keel.' },
];
export function vesselProgress(G, vessel) {
  const q = G.quests, paths = vessel.paths;
  const values = [
    ['Story', q.step, paths.story],
    ['Contracts', q.stats.contracts || 0, paths.contracts],
    ['Islands charted', q.discovered.length, paths.islands],
    ['Ships sunk', G.stats.ships || 0, paths.ships],
  ];
  return {
    unlocked: values.some(([, value, need]) => value >= need),
    text: values.map(([label, value, need]) => `${label} ${Math.min(value, need)}/${need}`).join(' · '),
  };
}
export const SUPPLIES = [
  { item: 'ball', n: 10, price: 40 },
  { item: 'shot', n: 20, price: 30 },
  { item: 'plank', n: 12, price: 30 },
  { item: 'coconut', n: 4, price: 20 },
  { item: 'grog', n: 2, price: 45 },
  { item: 'lantern', n: 4, price: 50 },
];
