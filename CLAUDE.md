# Tower Defense (JUEGO CAÑONES)

Browser tower-defense game: vanilla JS ES modules + Canvas 2D in `game/`, no build step. Tests: `cd game && node --test` (all must pass). The user speaks Spanish: talk to them in Spanish.

## The user's rules

- Commit locally as you go; `git push` and the Vercel deploy (project `torres-defensa`, https://torres-defensa.vercel.app, Vercel CLI from `game/`) only when the user says a round of changes is done. Ask before publishing. Never enter credentials: the user logs in to Vercel themselves.
- `node server.js` (port 8420) is a shared LAN game people may be playing: never restart it without asking. To test, use `PORT=8431 DATA_DIR=<temp dir> node server.js`, or the no-cache static server `python tools/serve_nocache.py game 8421`.
- Never ship Command & Conquer images (copyrighted). Don't rewrite git history.
- Don't spawn subagents unless the user asks.
- The game plays music: before testing in a browser set localStorage `td_settings` to `{"music":false,"effects":false}`, and close the tab afterwards.

## The 3D art: units, turrets, the RTS base and the maps

- The army (tank, buggy, motorcycle, rocket truck, soldier), the defence's three turrets and the RTS mode's base (its seven buildings, the wall block, the harvester, the MCV, the ore crystals) are 3D models built by Blender scripts in `tools/blender/` (`units.py`, `towers.py`, `rts.py`, on `kit.py`); nothing is modelled by hand. `blender -b --factory-startup -P tools/blender/build.py -- <out> <name> <preview|icon|glb|sprites>` renders one job, and `python tools/blender/pack_sprites.py <out> game/assets <name>...` puts the results in `game/assets/units3d/` (sprite sheets, pictures, icons) and `game/assets/models/` (GLB, for the RTS mode's 3D view).
- `game/js/unitSprites.js` holds each model's numbers (frame size, scale, where the turret and the muzzle are) and how a unit looks from frame to frame (hull easing, turret aiming, wheels, walk, recoil). They must match `SPECS` in the Blender scripts. It is looks only: the simulation doesn't know about it.
- Maps are built the same way, from the game's own data: `node tools/blender/maps/dump_level.mjs <N> <json>` writes a level's roads, wall, gates and build slots; `maps/level<N>_layout.py` (plain Python: numpy + PIL) lays the map out and paints its ground; `maps/level<N>_build.py` (Blender) models what stands on it and renders the map and its foreground (what the game draws over the units); `maps/pack_map.py` puts them in `game/assets/maps/`. Change a road in `levels.js` and the map has to be rendered again. Towers can stand on any build slot, so nothing solid goes on one: ruins' walls run on the lines half-way between slots, trees stand where four slots' squares meet.
- All four levels' maps are built this way: level 3 by its own `level3_layout.py` / `level3_build.py` (it is also the RTS mode's map: `pack_map.py <dir> game/assets 3 3d` ships its flat ground and its model for the 3D view too), levels 1, 2 and 4 by `level<N>_layout.py` on `paintkit.py` and the one `build_map.py` on `scenekit.py`. Levels 1 and 2 (1200 x 750) are rendered at twice their size. A building hides what is behind it, so none stands where its picture would cover a build slot or a road.
- Still on older pictures: the defence mode's wall blocks and support buildings.

## How the work is done

- Each part of the roadmap gets a design doc (the spec, approved by the user) and implementation plans in `docs/`, executed task by task with TDD (a test that fails first). Decisions the spec doesn't settle are recorded as rulings, each with what it costs if wrong, and reported to the user at the end with the deferred minor issues.
- Roadmap the user approved, in order: (1) main menu + saved games -- done; (2) attack mode against a computer defence -- done (`docs/2026-10-09-modo-atacante-*`); (3) one against the other on the home network -- done (`docs/2026-10-09-uno-contra-otro-*`); (4) online rooms with a code -- hosting still undecided (a room server on the user's VPS, Supabase Realtime, or P2P/WebRTC).
- The defence game's balance must not change by accident. Changes to shared code (`enemy.js`, `simulate.js`) used by other modes are opt-in for those modes (see `stepEnemy`'s `turnFirst` option), and gameplay changes are checked with seeded headless bot games, old code against new.
- The attack mode was tuned with the headless bot `game/js/attackBot.js` (it is published with the game: the phones' automatic army, `autoArmy.js`, uses it too, and `js/deploy.test.js` fails if `.vercelignore` leaves out a module the browser loads); the tuned values carry comments saying so.
