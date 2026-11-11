# Brinebound: hand-off guide

Version 0.6.38. Read this first if you are an AI assistant (or a person) picking up the project. It explains what the game is, how to build it, where everything lives, and the rules the codebase follows.

## Starter prompt

Upload the project zip (or the single `-source.md` file) to the assistant and send something like:

> I'm continuing work on my browser game Brinebound. Read HANDOFF.md first. Then: [what you want changed]. Edit the files in `src/`, rebuild with `python3 tools/build.py` (or `node build.mjs` if Node packages are installed), bump the version, and give me back the rebuilt `dist/brinebound.html` and a zip of the updated project.

## What the game is

Brinebound (a working title) is a first-person pirate sandbox that runs in one HTML page: Minecraft-style mining and building on smooth voxel islands, Sea of Thieves-style sailing and ship fights, Rust-style snap-together building, and Sid Meier's Pirates!-style contracts and story. It uses three.js (r170) and nothing else. Most textures, models, sounds and tunes are generated in code; the shared human avatar uses the CC0 rigged model in `src/assets/`.

What is in it now:

- A 1824 x 1824 block world (about 1.8 km across) of 54 islands, including eight large additions, with 24 settlements and chart-and-report expedition side quests from Old Mags and Brother Tallow.
- Mining, chopping (trees fall whole), crafting, and Rust-style building pieces (floors, walls, windows, doorways, stairs, roofs, posts) in wood or stone. Unsupported pieces fall. Debris tumbles, floats and settles.
- A player fleet of sloop, cutter, brigantine and frigate hulls, with distinct sailing, durability, gun and turning profiles. Commission and switch boats through Old Mags’ shipyard; upgrades apply across the fleet, and compatible older saves default to the sloop.
- Ships collide hull to hull: each hull is a chain of circles that follows its shape, so ships can lie alongside each other, glance off coasts and rocks, and take damage when they ram.
- Other ships: merchantmen and packet ships, navy frigates and cutters, pirate brigs and raiders, plus ghostly hollow ships. Their rigs, speed, turning, durability and broadside strength differ while the shared deck and collision plan stays safe for boarding. Each has NPC sailors (helmsman, gunners, deckhands, a lookout with a musket); you can board any ship, fight the crew and loot its strongbox.
- Combat: cutlass, flintlock pistol, blunderbuss and musket (lead shot), broadsides, a kraken, hollowmen that rise at night away from lantern light, and skeleton camps.
- A character creator, first- and third-person cameras, crouching, crawling, sliding, a grappling hook, ledge climbing and emotes.
- Gold and valuables (goblets, pearls, rubies, idols) that you lose if you die unless you stow them in the sea chest or bank them with Old Mags, who runs the trading post and sells upgrades and supplies.
- An eight-chapter story, a parallel Shipwright’s Wager, and contracts with multiple reputation routes to boat charters; also a map, day and night, storms, weather and wildlife (parrots you can tame, boars, goats, crabs, turtles, fish, dolphins, sharks, whales).
- A soundtrack of five original tunes, played live by a synthesized band, that follows the action.
- Three save slots plus an autosave in the browser, and save files you can download and load.
- Touch controls for phones and tablets, with a compact HUD on small screens (upright or sideways), and quality presets for slower devices.
- Gamepad controls for standard-layout controllers such as the PS5 DualSense, including twin-stick play and menu navigation.
- Controller-aware interaction prompts, an optional replayable first-voyage guide, and enhanced procedural sun glints and shallow-water shimmer.
- Inside the Claude app only: cloud saves and "crew" multiplayer (see Outside Claude below).

## Run it

Open `dist/brinebound.html` in a desktop or mobile browser (Chrome, Edge, Safari or Firefox). It needs an internet connection, because three.js and the fonts load from CDNs. Nothing needs installing to play. `dist/brinebound-offline.html` has three.js built in and runs with no connection (the fonts fall back to similar ones); it is the file the Unity kit uses. For Unity, read `UNITY.md`.

## Work on it

`npm install` once, then `npm run dev`: it builds the game, serves it at `http://localhost:8080` and on the local network (it prints the address and a QR code for a phone), rebuilds in a fraction of a second whenever a file in `src/` is saved, and reloads the page straight back into the voyage that was open. Build errors and game errors appear in a red box on the page; `?debug` at the end of the address adds an on-screen console (eruda), which helps on phones. `npm run publish` writes `docs/` (the game plus icons and a manifest, so it can sit on an iPhone home screen) for GitHub Pages. `SETUP.md` walks through the whole Windows and iPhone setup. VS Code tasks for all of this are in `.vscode/tasks.json` (Ctrl+Shift+B plays).

## Build it

The page is built from `src/` into one HTML file. There are two ways, and both give a working `dist/brinebound.html`:

1. With Node 18 or newer: `npm install`, then `node build.mjs` (add `--min` to minify). This bundles the modules with esbuild. It is the build that gets published. `node build.mjs --offline` also bundles three.js, into `dist/brinebound-offline.html`.
2. With only Python 3: `python3 tools/build.py`. No packages and no internet needed. It keeps each module unbundled in its own script tag and loads them through blob: URLs. Use it when npm is not available, such as in an AI's code sandbox.

To work on it with live files instead, serve the project folder with any static server (for example `python3 -m http.server`) and open `dist/brinebound.html` after each build. There is no hot reload outside the Claude app.

## Project map

| File | What is in it |
| --- | --- |
| `src/template.html` | The page: all CSS, the HUD and title-screen markup, the import map for three.js, and the `/*__GAME__*/` slot the build fills with the code. The "NEW IN" line on the title screen is here. The phone HUD is the "compact HUD" block of media queries near the end of the CSS (`max-width: 640px` or `max-height: 520px`, then separate upright and sideways layouts). |
| `src/main.js` | Entry point. Creates the `Game` and exposes it as `window.__brinebound`. |
| `src/game.js` | The `Game` class: renderer, scene and camera, the main loop and state machine, player actions (mining, fighting, using things), interactions, ship boarding, loot and banking, the camera, the soundtrack's mood choice, save and load. The biggest file; read only the parts you need. |
| `src/config.js` | `VERSION`, world constants, blocks (`BLOCKS`, `B`), items (`ITEMS`), recipes (`RECIPES`), the default hotbar, captain looks, small helpers. |
| `src/world.js` | World generation (islands, settlements, caves, forts, ruins, reefs, wrecks), block storage, edits, chunk meshing and visibility, walking and ground queries. |
| `src/surface.js` | Smooth terrain meshes from block data (constrained Surface Nets). |
| `src/materials.js`, `src/textures.js`, `src/paint.js` | Shaders and materials, the block texture atlas, painted surfaces for crafted blocks, bark and plants. |
| `src/geo.js`, `src/models.js`, `src/props.js` | Rounded-box and ellipsoid geometry helpers, organic procedural animal models, placed props (lanterns, barrels, signs). |
| `src/water.js`, `src/sky.js`, `src/weather.js` | The ocean shader and wave height function (the shader also cuts the sea out of every ship's hull, from `Ocean.setShips`, so holds stay dry), sun glints, shallow-water shimmer, sky and the day/night cycle, storms and rain. |
| `src/player.js` | Player movement and physics: walking, sprinting, sliding, crouching, climbing, swimming, standing on moving decks, emotes. |
| `src/character.js` | Captain and sailor models, poses and animation, held items, the first-person arm, portraits. |
| `src/assets/human-base-rigged.glb`, `src/assets/ATTRIBUTION.txt` | CC0 human base mesh and its source/license record. The Node and Python builds embed the model in the single-page game. |
| `src/input.js` | Keyboard, mouse (pointer lock), touch (joystick, look pad, buttons) and standard-layout gamepads such as DualSense. |
| `src/ship.js` | Ship designs, detailed hulls, deck layout in ship-local coordinates, sailing physics, waterline hull-footprint collisions with land and other ships, cannons and broadsides, damage and sinking. Classes share the proven hull and walkable-deck plan; rigging and handling vary by class. Every ship is built `SCALE` (2) times bigger, and the hold floor, walkable bounds and bilge shape must stay aligned with the full-size plan the player walks. Sail cloth dimensions are defined by `sailGeo` and the sail's anchor stays aligned with its yard. |
| `src/fleet.js` | Other ships at sea and their sailing AI, notoriety with the navy. |
| `src/crews.js` | NPC sailors on other ships: posts, alerts, fighting boarders, the strongbox when the ship is taken. |
| `src/enemies.js` | Hollowmen and skeleton camps, plus the hollow ships' attack AI. |
| `src/kraken.js` | The kraken fight. |
| `src/guns.js` | Pistol, blunderbuss and musket: firing, tracing shots, reloads, tracers and muzzle flashes. |
| `src/hook.js` | The grappling hook. |
| `src/build.js`, `src/pieces.js` | The builder's hammer and the snap-together building pieces; procedural bevels soften their edges. |
| `src/physics.js` | Debris, falling trees, collapsing structures, floating wreckage. |
| `src/fx.js` | Particles and cannonballs. |
| `src/fauna.js`, `src/life.js` | Wildlife and its behaviour; ambient life such as birds and fish. |
| `src/npcs.js`, `src/quests.js`, `src/shop.js` | Townsfolk, the story chapters and contracts, Old Mags' shop. |
| `src/ui.js`, `src/sheets.js` | The HUD, toasts, hotbar and icons; the full-screen menus ("sheets"): menu, bag and crafting, map, quests, settings, help, captain creator, saves, crew. |
| `src/save.js`, `src/settings.js` | Save slots, autosave, compression, import and export, and cloud mirroring; per-browser settings. |
| `src/net.js` | Crew multiplayer over the Claude app's room capability: host-authoritative state, presence, requests. |
| `src/audio.js`, `src/music.js` | Sound effects and ambience synthesized with Web Audio; the soundtrack (five tunes, a band of synthesized instruments, a reverb, the scheduler). |
| `src/noise.js` | Seeded random numbers and noise. |
| `build.mjs`, `tools/bundle.mjs` | The esbuild build (`bundle.mjs` holds it, shared by the other tools). |
| `tools/dev.mjs` | `npm run dev`: the live-reload server for PCs and phones. |
| `tools/publish.mjs`, `web/` | `npm run publish`: the game, icons and manifest in `docs/` for GitHub Pages; `web/` holds the icons (drawn by `tools/make_icons.py`). |
| `SETUP.md`, `.vscode/` | The Windows and iPhone setup guide; VS Code tasks and settings. |
| `tools/build.py` | The Python-only build. |
| `tools/export.py` | Makes the hand-off files in `exports/`: the playable page, this project as a zip, all the source in one Markdown file, and the Unity kit. |
| `tools/render_music.py` | Renders the five tunes to MP3s in `unity/Audio/` (needs Playwright and ffmpeg). |
| `UNITY.md`, `unity/BrineboundWebView.cs` | How to run the game inside a Unity app, or port it to C#; the C# script that shows the game in a web view. |
| `tests/` | Browser tests (Python + Playwright) used during development. See Tests below. |

## How it fits together

- **Loop and states.** `Game.loop` runs every animation frame. `state` is `'loading'`, `'title'`, `'play'` or `'sheet'` (a menu is open; the world keeps running). `updatePlay` reads input and then `simulate(dt)` advances everything in a fixed order: wind, player, your sloop, other ships and their AI, the kraken, ship collisions, NPC crews, guns, player actions, enemies, projectiles, physics, particles, props, townsfolk, quests, weather, wildlife, chunk remeshing, the camera, the hook, the avatar and view model, timers, ambience and music, the HUD, and the autosave timer.
- **World.** Blocks live in flat typed arrays, `W x H x D` = 1632 x 88 x 1632 (`WS` = 3 in `config.js` scales the world and the islands), sea level at y = 60. The world has twice the previous map area, 46 islands, and extends about four times deeper underground than before to an unbreakable bedrock floor. Island seabeds now ease down over a broad underwater shelf to the shared bedrock floor, avoiding an abrupt edge where the generated island mesh ends. `world.set(x, y, z, block, edit)` changes a block and marks chunks (16 x 16 columns) dirty; `processDirty` remeshes a few per frame. Terrain renders as smooth surfaces; crafted blocks and building pieces use procedural bevels. Player edits are stored separately (`world.edits`) so a save only holds the differences from the generated world. Generation is deterministic from `SEED`; the 0.6.16 loader remaps older 1152-wide save edits into the expanded map and preserves the older island locations.
- **Ships.** Each ship has a world position and heading; its deck, hold, stairs, cannons and fittings are in ship-local coordinates (waterline at y = 0, bow towards -z). The plan in `ship.js` is drawn for size 1 and every ship's model is scaled by `ship.size` (`SCALE` = 2). The player walks the plan in metres (`SHIP`, `floorAt`, `ceilingAt`, `deckObstacles`), whose margins for a body are not scaled. NPC sailors ride the scaled model, so they walk the size-1 plan (`SHIP1`, `floorAt1`...) and are shrunk back to human size; `shipToWorld` in `crews.js` converts. When the player stands on a ship, `player.ship` points to it and the player is simulated in that ship's frame (in metres). `Game.shipCollisions` resolves ship against ship; `Ship.physics` handles running aground.
- **Ship collisions.** `Ship.hullOutline()` transforms the convex waterline profile used by both land-cell overlap tests and ship-to-ship SAT. Keep it aligned with the lofted hull profile when changing the hull shape; the boarding deck remains a separate walkable plan.
- **NPC crews.** `crews.js` puts sailors on every non-player ship. When someone boards, the ship goes on alert and the crew fights. When all are down the ship is "taken": she stops, and her strongbox can be broken open.
- **Saves.** A save is a JSON document: `meta` (name, day, time) and `data` (player, inventory, active ship type and owned vessels, quests, gold, chest, world edits compressed with deflate-raw and base64). Older 0.6 save documents still load and default to an owned sloop. Local saves use `localStorage` keys `brinebound-v2-auto` and `brinebound-v2-s1` to `-s3`; settings use `brinebound-settings`. "Continue voyage" opens the newest save and falls back to older ones if it cannot be read.
- **Audio.** No audio files. `audio.js` makes the effects (cannons, guns, waves, rain, creaks, gulls). `music.js` holds five tunes written as note strings with chords and a form, a small band (fiddle, tin whistle, concertina, plucked strings, bass, drone, drums, claps) and a scheduler. `Game.musicMood` picks `title`, `port`, `sea`, `night` or `battle`.
- **Multiplayer.** Only inside the Claude app (see below). The host simulates everything; crew pages send their own position and requests and draw puppets of everything else. The host’s active vessel design is synchronized to the crew. `PROTO` in `net.js` must change whenever the shared messages change, so old and new pages do not mix.

## Rules the codebase follows

1. Keep the output one HTML file. The human model in `src/assets/` is CC0 and must remain embedded by both build scripts; its source and license are recorded in `src/assets/ATTRIBUTION.txt`. Other assets are generated in code.
2. Only original content: no copyrighted music, characters, logos or names.
3. It must keep working on phones: touch controls for every new action (see `input.js` and the touch buttons in `template.html`), no HUD pieces that overlap on a phone held upright or sideways (`tests/t67_phone_hud.py` checks), and no big drops in frame rate. Test with the "low" quality preset.
4. After every change, bump `VERSION` in `src/config.js` (0.5.1, then 0.5.2 and so on, or 0.6 for a big update) and rewrite the "NEW IN" line in `src/template.html`.
5. Saves must keep loading. If you change what a save holds, keep reading the old shape too.
6. Plain ES modules, two-space indents, single quotes, semicolons, short comments that say why.
7. Hand back whole files or exact edits, then rebuild and check the browser console for errors.

## Common changes

- **A new item:** add it to `ITEMS` in `config.js` (and to `RECIPES` if it is crafted), give it an icon in `ui.js` (the `PIX` pixel icons, or a block icon), and handle using it in `game.js` (`updateActions` and nearby). Held models are in `character.js` (`itemGeo`).
- **A new block:** add it to `BLOCKS` and `B` in `config.js`, paint its texture in `textures.js` or `paint.js`, and check `isSolid` and `isPlant`.
- **A new island:** see `moreIslands()` in `world.js`. Islands are placed with spacing checks; give new ones `late: true` so they never change the older islands. Sizes are written in the old units and multiplied by `WS`.
- **Bigger or smaller ships:** `SCALE` in `ship.js` (everything aboard follows). **A bigger or smaller world:** `WS` in `config.js`; the block arrays grow with its square, so test memory and load time on a phone.
- **Changing what a save holds:** saves carry `v` (4 since 0.6); `loadDoc` in `game.js` refuses others with a message, and `SaveSystem.candidates` hides them from Continue.
- **A new tune:** add an entry to `TRACKS` in `music.js` (melody parts, chords, form, style, tempo), then choose when it plays in `Game.musicMood`. Each bar's notes must add up to the bar length; the parser warns in the console if not.
- **A new menu:** add a method to `Sheets` in `sheets.js` and open it with `game.openSheet(name)`.
- **A new HUD piece or touch button:** add the markup in `template.html`, then give it a place in the compact HUD block too: the touch buttons sit in the `#tpad` grid by `grid-area` (`use`, `place`, `crouch`, `repair`, `hit`, `jump`), and the top-left corner beside the compass must stay narrow when the phone is upright. Run `tests/t67_phone_hud.py`; it prints any overlaps.
- **A new quest or contract:** `quests.js`.

## Debugging

- `window.__brinebound` is the `Game`. In the console you can try `__brinebound.gold = 500`, `__brinebound.player.pos`, `__brinebound.world.islands`, `__brinebound.sky.isNight`.
- Errors in the main loop are caught and logged so the game keeps running; watch the console.

## Tests

`tests/` holds the Playwright scripts used during development (`t13_flow.py` plays the opening chapters end to end, `t66_bigships.py` walks the 2x ships and tests ship collisions, `t67_phone_hud.py` screenshots the phone HUD upright and sideways and lists overlaps, `t5_mobile.py` the touch controls, `t64_tunnel.py` underground collisions, `t58_guns.py`, `t61_continue.py`, `t62_music.py` and so on). They serve `dist/` on port 8765 and drive the game through `window.__brinebound`. To run one: `pip install playwright`, `playwright install chromium`, build, then `python3 tests/t13_flow.py`. `tests/harness.py` finds the project from its own location (or `BRINEBOUND_ROOT`). Screenshots go to `tests/shots/`. Some older tests may need small updates to match the current game.

## Outside Claude

The game was built and published inside the Claude app, which gives the page a `window.claude` object with extra capabilities. Elsewhere that object does not exist, and the game carries on without it:

- Cloud saves: off. Saves stay in the browser's `localStorage`. To move a voyage, use Menu > Save > Download save file on one device, then Load > Load a save file (or Paste save text) on the other.
- Crew multiplayer: hidden, because it uses the app's shared rooms. To bring it back elsewhere you would need your own relay (for example a small WebSocket server) behind the same interface as `room` in `net.js`.
- Hot reload (`window.claude.hot`): not used.

## Version history

- **0.6.38:** replace the rectangular outpost cut with a curving, widening dock inlet and a sloped sandy edge.
- **0.6.37:** fix the terrain relief shader placement so island ground renders instead of disappearing.
- **0.6.36:** add light-reactive relief shading to block materials and bevel generated structure details to give timber, stone and cloth surfaces more depth.
- **0.6.35:** add layered roof and timber details across generated structures, widen house entrances for player clearance, anchor decorative lanterns to supports, and shape the outpost canopy.
- **0.6.34:** add an Ultra graphics preset with 4K shadows and longer view distance; Auto starts at High on desktop and keeps the Low default on touch devices.
- **0.6.33:** remove tree foliage left detached by later structure placement while preserving normal ruin placement.
- **0.6.32:** add terrain-to-foundation supports for settlements, camps and ruins; re-anchor tree roots after later structure placement, and keep palm fronds and bone arches connected to their supports.
- **0.6.31:** stop oak branches when blocked and only add side crowns where a branch remains connected to the trunk, preventing detached foliage.
- **0.6.30:** filled and rounded the oak crowns and connected diagonal branch meshes, removing the sparse, floating-log silhouette.
- **0.6.29:** opaque world materials render both sides of their surfaces, preventing angle-dependent see-through gaps in trees, blocks and ships.
- **0.6.28:** softened village-pad edges into the surrounding island, added detailed house foundations and timber framing, separated oak foliage into mottled clusters, connected wildlife legs to their bodies, and improved first-person hand and tool grips.
- **0.6.27:** expanded the chart to 1,824 blocks per side while preserving old island locations and migrating saved edits; added eight large islands and port villages, plus settlements across the frontier islands.
- **0.6.26:** fixed hairline gaps between adjacent beveled block-built structures by keeping shared edges flush; building-piece components no longer bevel into one another.
- **0.6.25:** replaced the short, flat-crowned main-island oaks with taller branched trees and layered, irregular foliage; the shared oak generator improves the same species across all islands without changing later generation randomness.
- **0.6.24:** replaced box-built wildlife with smooth procedural forms, curved barrels, inset storage props, beveled crafted blocks and building pieces, and refined human faces with blinking and subtle idle breathing. Retained the 0.6.23 hull-shaped ship collision and hull detail.
- **0.6.23:** replaced coarse circle-chain ship impacts and point-sampled coast checks with a hull-shaped waterline footprint, polygon SAT and terrain-cell overlap; added hull strakes and fasteners.
- **0.6.22:** added the Shipwright’s Wager as an optional story, with four alternative reputation routes to charter three purchasable player hulls. Boats can be bought or switched at Old Mags’ shipyard; hull, sail, rudder, armor and gun upgrades apply across the fleet, with Cutter and Brigantine charters opening later refits. Ownership and active hull are saved compatibly and synchronized to multiplayer crew.
- **0.6.21:** added packet ships, merchantmen, navy cutters and frigates, pirate raiders and brigs, plus a two-masted dreadship. NPC classes have distinct sailing speeds, turning, durability and gun capacity; the player sloop and save format are unchanged.
- **0.6.17:** reshaped the underwater island shelves to slope gradually from shore to the shared bedrock floor, removing the abrupt seabed edge.
- **0.6.18:** added standard-layout gamepad support, including DualSense twin-stick movement and aiming, action buttons and triggers, controller menu navigation, and a title-screen control guide.
- **0.6.19:** made the helm camera choose terrain-clear viewpoints near islands and reset immediately when taking the helm; raised the mainsail's lower edge to improve forward visibility.
- **0.6.20:** made interaction prompts reflect keyboard, gamepad or touch input; added an optional, replayable six-step first-voyage guide that persists with existing save hints; enhanced ocean sun glints and shallow-water shimmer.
- **0.6.16:** doubled the map area by expanding it to 1632 x 1632 blocks, added 23 Outer Reach islands and expedition side quests that require visiting a new island and reporting back. Older 0.6 saves remap their terrain edits into the expanded map while retaining the old islands and player position.
- **0.6.15:** rebuilt the stern transom as continuous outward-facing hull panels to close a see-through gap across the back of the ship.
- **0.6.14:** widened and lengthened the hold floor, added plank seams and fasteners, matched bilge collision to the wider hull, and added paused-menu shortcuts for customization, quests and an expandable chart.
- **0.6.13:** removed the decorative seabed plane that followed the camera and appeared as a moving green surface at bedrock.
- **0.6.12:** about four times more underground to mine, with an unbreakable bedrock floor; older 0.6 saves carry over their edits and player position.
- **0.6.11:** trouser coverage closes the exposed waist seam; held cutlass, pick and firearms have more detailed geometry and hand-centered grips; the third-person camera checks ship geometry to avoid clipping through rails and masts.
- **0.6.10:** facial hair is integrated into the face shading, with fine follicle stubble and a softer beard boundary.
- **0.6.9:** strand-based hair and beard grooming, a cleaner hairline, and detailed irises and pupils for the shared rigged avatars.
- **0.6.1:** a compact HUD on phones (thin meters, an icon toolbar, a short compass with the target bar under it, a smaller thumb cluster) laid out separately for upright and sideways; no pinch-zoom of the page in Safari while playing; the sea no longer shows inside ships' hulls.
- **0.6:** a world 10x the area: islands and the seas between them about 3x wider, with rolling hills and more ruins; every ship twice the size, everything aboard included; hull-shaped ship collisions (alongside, glancing off coasts, ram damage); faster ships; saves from earlier versions can't continue (the world changed).
- **0.5.3:** the PC and iPhone workflow: `npm run dev` (live reload, phone over Wi-Fi with a QR code, errors on the page, back into the voyage after each reload), `npm run publish` for GitHub Pages with a home-screen icon, VS Code tasks, `SETUP.md`.
- **0.5.2:** no more walking through tunnel walls or falling through the ground underground (upright walls of dug tunnels now block bodies, and a buried player is moved back into the tunnel rather than up through the rock); the offline build and the Unity kit.
- **0.5.1:** the soundtrack (five original tunes that follow the action), a sturdier Continue voyage (a JavaScript fallback for decompression, timeouts, fallback to older saves, visible errors), the Python-only build and these hand-off files.
- **0.5:** boarding other ships and fighting their NPC crews for the strongbox; pistols, blunderbusses and muskets; crouching, crawling and emotes; stowing gold and loot in the sea chest and selling valuables; new islands including a smugglers' cove and a ruined fort; a fix for seeing through the world while digging; the I'm stuck button.
- **0.4:** smooth terrain, physics for debris and falling trees, Rust-style building pieces, the grappling hook, rebuilt ships with walkable decks and holds, other ships at sea.
- **0.3:** crew multiplayer, nine more islands (a volcano, jungle keys), reefs, wrecks, ruins and wildlife.
- **0.2:** the story, contracts, the captain and ship designer, a third-person camera, the lighthouse, skeleton camps, storms, the kraken, cloud saves.
- **0.1:** the first prototype.

## Ideas that were on the list

More ship types and upgrades to buy, sailing with NPC crew of your own, more story chapters, more tunes (a tavern tune for Brine Haven at night, a kraken theme), and multiplayer outside Claude.
