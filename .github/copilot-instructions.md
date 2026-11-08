# Notes for coding agents

Read `HANDOFF.md` before changing anything: it maps every file in `src/` and lists the rules (procedural assets only, one HTML file, phone support, saves must keep loading).

- Run it: `npm install` once, then `npm run dev` (live reload at http://localhost:8080, also on the Wi-Fi for phones).
- Build: `npm run build` (or `python3 tools/build.py` with no Node packages). Output: `dist/brinebound.html` and `dist/brinebound-offline.html`.
- Publish for the iPhone: `npm run publish` writes `docs/` for GitHub Pages.
- After each change: bump `VERSION` in `src/config.js`, rewrite the "NEW IN" line in `src/template.html`, and check the browser console (or the dev server's on-page error box).
- HUD or touch-button changes: keep the phone layout clean. The compact HUD is the media-query block near the end of the CSS in `src/template.html`; `tests/t67_phone_hud.py` screenshots phones upright and sideways and lists any overlaps.
- Never edit `dist/` or `docs/` by hand: they are rebuilt from `src/`.
