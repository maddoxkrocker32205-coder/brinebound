import { Game } from './game.js';

function start(data) {
  if (window.__brinebound) return;
  window.__brinebound = new Game(data || {});
}

const hot = window.claude && window.claude.hot;
if (hot && hot.ready) hot.ready(start);
else start((hot && hot.data) || {});
