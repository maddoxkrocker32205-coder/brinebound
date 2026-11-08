// Old Mags' trading post: permanent upgrades and supplies, paid from banked gold.
export const UPGRADES = [
  { id: 'hull1', name: 'Oak-ribbed hull', desc: 'Hull strength rises from 120 to 160.', price: 250 },
  { id: 'hull2', name: 'Iron-banded hull', desc: 'Hull strength rises from 160 to 210.', price: 600, req: 'hull1' },
  { id: 'sails1', name: 'Fresh canvas', desc: 'Your sloop sails 12% faster.', price: 220 },
  { id: 'sails2', name: 'Silk-weave sails', desc: 'Another 13% on top of fresh canvas.', price: 550, req: 'sails1' },
  { id: 'guns', name: 'Third cannon', desc: 'Every broadside fires three balls instead of two.', price: 450 },
  { id: 'reload', name: 'Drilled gun crew', desc: 'Your cannons reload 25% faster.', price: 300 },
  { id: 'coat', name: 'Sea-wolf coat', desc: 'Your health rises from 100 to 130.', price: 280 },
  { id: 'pick', name: 'Steel pickaxe', desc: 'Mine stone and brick 60% faster.', price: 160 },
];
export const SUPPLIES = [
  { item: 'ball', n: 10, price: 40 },
  { item: 'shot', n: 20, price: 30 },
  { item: 'plank', n: 12, price: 30 },
  { item: 'coconut', n: 4, price: 20 },
  { item: 'grog', n: 2, price: 45 },
  { item: 'lantern', n: 4, price: 50 },
];
