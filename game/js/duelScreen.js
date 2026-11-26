// A duel, run in the browser (docs/2026-11-22-duelo-design.md §9-§11):
// the go-between of the page and the game. It runs a duel in one of two
// ways:
//   - against the computer: it holds the duel itself -- duel.js plays it,
//     duelAI.js takes the rival's turns;
//   - against another player at home: the home server holds it (host.js).
//     The screen draws what the server last sent and posts the player's
//     actions; what they do shows with the server's next news.
// Either way duelDraw.js paints regular duels, duelMusicStage.js +
// duelRhythmDraw.js paint the photorealistic 3D Musical Duel (both hangar
// buy phase and combat), duelUI.js fills its panels and duelProfile.js
// remembers what the player gained.
//
// main.js hands it every frame and every press of the pointer while a
// duel is on (the game's mode is "duel"); it never looks at the page
// beyond the elements it is given.
import {
  DUEL_UNITS,
  createDuelState,
  duelView,
  buyUnit,
  sellUnit,
  moveUnit,
  upgradeUnit,
  setReady,
  canPlace,
} from "./duel.js";
import { arenaOf } from "./duelArenas.js";
import { gradeStart, playTurn } from "./duelAI.js";
import { loadProfile, saveProfile, startOf, recordDuel, assignPoint } from "./duelProfile.js";
import {
  mountDuelShop,
  updateDuelShop,
  mountDuelUnitPanel,
  updateDuelUnitPanel,
  mountMusicalHangar,
  updateMusicalHangar,
  renderDuelLobby,
  showDuelResult,
  hideDuelResult,
  duelResult,
  duelNotice,
} from "./duelUI.js";
import { drawDuelGround, drawDuelShots, drawDuelBursts, drawDuelOver, drawDuelBanner, BURST_TIME } from "./duelDraw.js";
import { BOT_ACCURACY, createMusicalDuel, stepMusicalDuel, pressKey, releaseKey, songClock, beginFight } from "./duelRhythm.js";
import {
  APPROACH,
  approachOf,
  shakeOf,
  drawRhythm,
  drawRhythmSides,
  drawVolleys,
  drawRhythmHud,
  drawBuyHud,
  drawRhythmFlash,
  laneAt,
} from "./duelRhythmDraw.js";
import { stagePlaces, armyHealth } from "./duelStage.js";
import { createDuelMusicStage } from "./duelMusicStage.js";
import { drawSong } from "./duelSongs.js";

// Against the computer the player is always the left-hand side.
const PLAYER = "left";
const RIVAL = "right";

const SHOT_SOUND = { soldier: "machinegun", motorcycle: "machinegun", buggy: "machinegun", tank: "cannon", rocket: "missile" };
const REFUSED = {
  money: "No hay dinero suficiente",
  cap: "Tu ejército está completo",
  room: "No queda sitio en tu zona",
  ready: "Ya has dicho «¡Listo!»",
  phase: "La tienda abre entre asaltos",
  zone: "Solo puedes colocar en tu zona",
  blocked: "Ahí no cabe",
  max: "Esa mejora está al máximo",
  "empty-army": "Compra al menos una unidad",
  network: "No hay conexión con el servidor de casa",
};
const GRAB = 12; // px round a unit within which a press takes it (a finger is wide)
const DRAG_AFTER = 6; // px the pointer moves before a press is a drag, not a tap
const NEWS_EVERY = 0.12; // s between the home server's news (main.js's POLL_MS)
const SETTLE = 0.5; // s a unit just dropped stays where it was dropped, until the server says

// A musical duel's keys (duelRhythm.js), by the keyboard's: the arrows, and
// the numbers of either the top row or the number pad.
const KEY_LANE = {
  ArrowLeft: "left",
  ArrowDown: "down",
  ArrowUp: "up",
  ArrowRight: "right",
  Digit1: "1",
  Digit2: "2",
  Digit3: "3",
  Numpad1: "1",
  Numpad2: "2",
  Numpad3: "3",
};

export function createDuelScreen({
  ctx,
  shopEl,
  panelEl,
  hangarEl,
  resultEl,
  drawUnit,
  resetVisuals,
  playSound,
  showToast,
  onRematch,
  onExit,
  onLayoutChange,
  storage,
  music,
}) {
  // --- a duel against the computer
  let state = null;
  let arena = 1;
  let grade = 1;
  let profile = null;
  // --- a duel the home server holds: what main.js gave with the last frame
  // ({ state, net, ask, address }), or null against the computer
  let remote = null;
  let lastNews = null; // the server's latest state
  let prevNews = null; // the one before it, to draw the units between the two
  let newsAt = 0; // s, when the latest arrived
  // --- either way
  let clock = 0; // s of frames drawn
  let selectedId = null;
  let press = null; // { id, x, y, offX, offY, moved }: a unit under the pointer, held
  let drag = null; // { id, x, y, ok }: where the held unit would go
  let settle = null; // { id, x, y, ok, until }: a unit dropped, waiting for the server's word
  let bursts = [];
  let scorch = [];
  let seenShots = new WeakSet();
  let fallen = new Set();
  let lastPhase = "buy";
  let recorded = false;
  // --- a musical duel: keys just pressed, photorealistic 2.5D stage & combat FX
  let presses = {};
  let seenEvents = new WeakSet();
  let fingerLane = null; // the key a finger on the track is holding down
  let approach = APPROACH; // s the keys are taking down the track, as drawn
  let loading = false; // its song's recording hasn't come yet
  const photoStage = createDuelMusicStage();
  let lastProjected = null; // Map of unit id -> { x, y, muzzleX, muzzleY, left, top, w, h }
  let healthLag = { left: 1, right: 1 }; // fighting-game white damage-drain trail
  let impacts = []; // lingering multi-stage explosions when volley shells hit
  let impactedShots = new WeakSet();
  let shopHiddenForMusical = false;

  function syncShopVisibility(hideForMusical) {
    if (!shopEl || shopHiddenForMusical === hideForMusical) return;
    shopHiddenForMusical = hideForMusical;
    shopEl.classList.toggle("hidden", hideForMusical);
    if (onLayoutChange) onLayoutChange();
  }

  // The arenas' pictures (for regular Duel), fetched when first needed.
  const pictures = new Map();
  function picturesOf(id) {
    if (!pictures.has(id)) {
      const load = (src) => {
        if (!src) return null;
        const img = new Image();
        img.src = src;
        return img;
      };
      pictures.set(id, { map: load(arenaOf(id).image), foreground: load(arenaOf(id).foreground) });
    }
    return pictures.get(id);
  }
  const loaded = (img) => (img && img.complete && img.naturalWidth > 0 ? img : null);

  // The duel on screen and the side this player has in it (null: watching
  // two others, on the home network).
  const duel = () => (remote ? remote.state : state);
  const mySide = () => (remote ? remote.net.you : PLAYER);
  // What this player may see of it.
  const seen = () => (remote || state.phase !== "buy" ? duel() : duelView(state, PLAYER));

  function forget() {
    selectedId = null;
    press = null;
    drag = null;
    settle = null;
    bursts = [];
    scorch = [];
    seenShots = new WeakSet();
    fallen = new Set();
    lastPhase = "buy";
    recorded = false;
    presses = {};
    seenEvents = new WeakSet();
    fingerLane = null;
    loading = false;
    lastProjected = null;
    healthLag = { left: 1, right: 1 };
    impacts = [];
    impactedShots = new WeakSet();
    photoStage.reset();
    if (hangarEl) hangarEl.classList.add("hidden");
    syncShopVisibility(false);
    if (music) music.stop();
    hideDuelResult(resultEl);
    resetVisuals();
  }

  // A new duel in this arena against the computer of its league.
  let songs = {}; // the musical duels' songs still to play (duelSongs.js's drawSong)
  function start(arenaId, { musical = false } = {}) {
    remote = null;
    profile = loadProfile(storage);
    arena = Math.min(arenaOf(arenaId).id, profile.league);
    grade = arena;
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const options = { arena, seed, left: startOf(profile), right: gradeStart(grade, seed) };
    if (musical) {
      const drawn = drawSong(songs);
      songs = drawn.bag;
      options.song = drawn.song;
    }
    state = musical ? createMusicalDuel({ ...options, bots: { [RIVAL]: BOT_ACCURACY[grade - 1] } }) : createDuelState(options);
    if (musical && music) music.load(state.musical.song);
    if (musical) photoStage.preload(arena);
    state.paused = false;
    forget();
    picturesOf(arena);
    playTurn(state, RIVAL, grade); // the computer shops first, and waits
    return state;
  }

  // ---------------------------------------------------------- the actions

  function refuse(reason) {
    playSound("error");
    showToast(REFUSED[reason] || "No se puede");
  }

  function act(local, body, then = () => {}) {
    const settleIt = (result) => {
      if (result && result.ok) then(result);
      else refuse(result ? result.reason : "network");
    };
    if (remote) remote.ask(body).then(settleIt);
    else settleIt(local());
  }

  const shopping = () => {
    const d = duel();
    const side = mySide();
    return Boolean(d && side && d.phase === "buy" && !d.sides[side].ready);
  };
  const army = () => (mySide() ? duel().sides[mySide()].army : []);
  const picked = () => (duel().phase === "buy" ? army().find((u) => u.id === selectedId) : null) || null;

  function doBuy(type) {
    act(() => buyUnit(state, PLAYER, type), { type: "duelBuy", unitType: type }, (result) => {
      selectedId = result.unit.id;
    });
  }
  function doUpgrade(skill) {
    const unit = picked();
    if (unit) act(() => upgradeUnit(state, PLAYER, unit.type, skill), { type: "duelUpgrade", unitType: unit.type, skill });
  }
  function doSell() {
    const id = selectedId;
    act(() => sellUnit(state, PLAYER, id), { type: "duelSell", id }, () => {
      if (selectedId === id) selectedId = null;
    });
  }
  function doClosePanel() {
    selectedId = null;
  }

  // Puts the duel's shop, unit panel and musical hangar in their elements.
  function mount() {
    mountDuelShop(shopEl, {
      onBuy: doBuy,
      onReady: ready,
    });
    mountDuelUnitPanel(panelEl, {
      onUpgrade: doUpgrade,
      onSell: doSell,
      onClose: doClosePanel,
    });
    if (hangarEl) {
      mountMusicalHangar(hangarEl, {
        onBuy: doBuy,
        onReady: ready,
        onUpgrade: doUpgrade,
        onSell: doSell,
        onClose: doClosePanel,
      });
    }
    const isMusical = Boolean(!remote && state && state.musical);
    shopHiddenForMusical = isMusical;
    shopEl.classList.toggle("hidden", isMusical);
    if (hangarEl) hangarEl.classList.toggle("hidden", !(isMusical && state.phase === "buy"));
  }

  // «¡Listo!»
  function ready() {
    if (!shopping()) return;
    if (army().length === 0) return refuse("empty-army");
    selectedId = null;
    act(() => setReady(state, PLAYER), { type: "duelReady" }, () => {
      if (!remote) watch();
    });
  }

  // ---------------------------------------------------------- what changed

  function watch() {
    const d = duel();
    if (d.phase !== lastPhase) {
      if (d.phase === "combat") {
        fallen = new Set();
        scorch = [];
        impacts = [];
        impactedShots = new WeakSet();
        healthLag = { left: 1, right: 1 };
        photoStage.reset();
        press = null;
        drag = null;
        settle = null;
      } else if (d.phase === "buy") {
        if (lastPhase === "over") forget(); // a rematch (on the home network)
        if (!remote) playTurn(state, RIVAL, grade);
        if (d.round > 1) showToast(`Asalto ${d.round}`);
      } else if (d.phase === "over") {
        finish();
      }
      lastPhase = d.phase;
    }
    for (const shot of d.shots) {
      if (remote ? shot.age >= NEWS_EVERY : seenShots.has(shot)) continue;
      seenShots.add(shot);
      playSound(SHOT_SOUND[shot.type]);
    }
    for (const event of d.musical ? d.musical.events : []) {
      if (seenEvents.has(event)) continue;
      seenEvents.add(event);
      if (event.side === mySide() && event.kind === "miss") playSound("error");
    }
    for (const u of d.units) {
      if (u.alive || fallen.has(u.id)) continue;
      fallen.add(u.id);
      const proj = d.musical && lastProjected ? lastProjected.get(u.id) : null;
      if (proj) {
        bursts.push({ x: proj.x, y: proj.y, age: 0, size: Math.max(52, u.radius * 3.8 * proj.scale) });
      } else {
        const shown = d.musical ? stagePlaces(d.units).get(u.id) : null;
        const at = shown || { x: u.x, y: u.y, scale: 1 };
        bursts.push({ x: at.x, y: at.y, age: 0, size: u.radius * 2.2 * at.scale });
        scorch.push({ x: at.x, y: at.y, r: u.radius * at.scale });
      }
      playSound("cannon");
    }
  }

  function finish() {
    if (recorded) return;
    recorded = true;
    const d = duel();
    const side = mySide();
    if (!side) return;
    const rival = remote ? "player" : "computer";
    let gained = { xp: 0, levels: 0, promoted: false, champion: false };
    let mine = loadProfile(storage);
    const mark = `${d.arena}:${d.rng}`;
    let counted = false;
    try {
      counted = Boolean(remote) && sessionStorage.getItem("td_duel_counted") === mark;
    } catch {
      // (no sessionStorage: it is counted)
    }
    if (!counted && !d.musical) {
      const outcome = recordDuel(mine, { arena: d.arena, won: d.winner === side, xp: d.sides[side].xp, rival });
      mine = outcome.profile;
      gained = outcome.gained;
      saveProfile(mine, storage);
      try {
        if (remote) sessionStorage.setItem("td_duel_counted", mark);
      } catch {
        // (as above)
      }
    }
    profile = mine;
    const ask = remote && remote.ask;
    const result = duelResult(d, side, gained, mine, rival);
    if (d.musical) result.league = "Duelo musical de prueba: no cuenta para tu liga ni da experiencia";
    showDuelResult(resultEl, result, {
      onRematch: () =>
        ask ? ask({ type: "rematch" }).then((r) => r.ok || refuse(r.reason)) : onRematch(arena, { musical: Boolean(d.musical) }),
      onExit,
    });
  }

  // ---------------------------------------------------------- a frame

  function takeNews() {
    if (remote.state === lastNews) return;
    prevNews = lastNews;
    lastNews = remote.state;
    newsAt = clock;
    if (selectedId != null && !army().some((u) => u.id === selectedId)) selectedId = null;
    watch();
  }

  function between() {
    const d = lastNews;
    const since = clock - newsAt;
    if (d.phase !== "combat" || d.paused) return d;
    const k = Math.min(1, since / NEWS_EVERY);
    const before = new Map((prevNews && prevNews.phase === "combat" ? prevNews.units : []).map((u) => [u.id, u]));
    return {
      ...d,
      units: d.units.map((u) => {
        const was = before.get(u.id);
        return was && was.alive && u.alive ? { ...u, x: was.x + (u.x - was.x) * k, y: was.y + (u.y - was.y) * k } : u;
      }),
      shots: d.shots.map((shot) => ({ ...shot, age: shot.age + since })).filter((shot) => shot.age < 0.4),
    };
  }

  function frame(dt, { running = true, remote: news = null } = {}) {
    if (news && !remote) forget();
    remote = news;
    const d = duel();
    if (!d) return;
    clock += dt;
    if (remote) takeNews();
    else if (running && !d.paused) {
      let step = dt;
      loading = false;
      if (state.musical) beginFight(state);
      if (music && state.musical && state.phase === "combat") {
        const song = state.musical.song;
        loading = !music.ready(song);
        if (loading) step = 0;
        else {
          const heard = music.follow(song, songClock(state));
          if (heard !== null) step = heard;
        }
      } else if (music) {
        music.stop();
      }
      if (step > 0) stepMusicalDuel(state, step);
      watch();
    } else if (music) {
      music.stop();
    }
    const playing = Boolean(!remote && d.musical && d.phase === "combat");
    for (const lane of Object.keys(presses)) presses[lane].age += dt;
    if (remote ? !d.paused : running && !d.paused) {
      for (const burst of bursts) burst.age += dt;
      bursts = bursts.filter((burst) => burst.age < BURST_TIME);
      for (const imp of impacts) imp.age += dt;
      impacts = impacts.filter((imp) => imp.age < imp.life);
    }
    if (settle && clock > settle.until) settle = null;

    const side = mySide();
    const view = remote ? between() : seen();
    const art = picturesOf(d.arena);
    const isMusicalLocal = Boolean(!remote && d.musical);
    const musicalBuy = isMusicalLocal && d.phase === "buy";
    const musicalStage = isMusicalLocal && (d.phase === "combat" || d.phase === "roundEnd" || d.phase === "over");

    // In Musical Duel, the old left Attack sidebar is replaced in ALL phases by
    // the full-screen photorealistic 3D battlefield + matching 3D Hangar Dock.
    syncShopVisibility(isMusicalLocal);
    if (hangarEl) hangarEl.classList.toggle("hidden", !musicalBuy);

    const scene = {
      view,
      side: side || PLAYER,
      watching: !side,
      map: loaded(art.map),
      foreground: loaded(art.foreground),
      drawUnit,
      selectedId,
      drag: drag || settle,
      scorch,
      bursts,
      notice: remote ? duelNotice(remote.net, remote.address) : "",
      paused: Boolean(d.paused) && !(remote && (remote.net.waiting || remote.net.gone)),
    };

    if (musicalBuy) {
      approach = APPROACH;
      lastProjected = photoStage.render(ctx, view, {
        clock,
        dt: running && !d.paused ? dt : 0,
        side: scene.side,
        buyPhase: true,
        selectedId,
      });
      drawBuyHud(ctx, { view, side: scene.side, paused: scene.paused });
      if (hangarEl) updateMusicalHangar(hangarEl, view, scene.side, picked());
      panelEl.classList.add("hidden");
    } else if (musicalStage) {
      for (const s of ["left", "right"]) {
        const cur = armyHealth(view, s);
        if (cur > healthLag[s]) healthLag[s] = cur;
        else healthLag[s] = Math.max(cur, healthLag[s] - dt * 0.42);
      }
      if (playing) {
        const pace = approachOf(d.musical.tally[scene.side].streak);
        approach += (pace - approach) * Math.min(1, dt * 4);
      } else {
        approach = APPROACH;
      }
      const shake = playing ? shakeOf(d, scene.side) : { x: 0, y: 0, red: 0 };

      ctx.save();
      ctx.translate(shake.x * 0.55, shake.y * 0.55);
      lastProjected = photoStage.render(ctx, view, {
        clock,
        dt: running && !d.paused ? dt : 0,
        side: scene.side,
        buyPhase: false,
      });

      const rhythmView = {
        ...view,
        shots: view.shots.map((shot) => {
          const pf = lastProjected.get(shot.fromId);
          const pt = lastProjected.get(shot.toId);
          return {
            ...shot,
            from: pf ? { x: pf.muzzleX, y: pf.muzzleY } : shot.from,
            to: pt ? { x: pt.x, y: pt.y } : shot.to,
          };
        }),
      };

      for (const shot of view.shots) {
        if (shot.age >= 0.25 && !impactedShots.has(shot)) {
          impactedShots.add(shot);
          const pt = lastProjected.get(shot.toId);
          const at = pt || shot.to;
          const heavy = shot.type === "tank" || shot.type === "rocket";
          impacts.push({
            x: at.x + (Math.random() - 0.5) * 14,
            y: at.y + (Math.random() - 0.5) * 10,
            age: 0,
            life: heavy ? 0.78 : 0.48,
            size: shot.type === "rocket" ? 68 : heavy ? 54 : 30,
            heavy,
            seed: Math.random() * 6.28,
          });
        }
      }

      const rhythm = {
        view: rhythmView,
        side: scene.side,
        presses,
        loading,
        approach,
        healthLag,
        impacts,
        paused: scene.paused,
      };

      drawRhythmSides(ctx, rhythm);
      if (playing) drawRhythm(ctx, rhythm);
      drawVolleys(ctx, rhythm);
      drawDuelBursts(ctx, scene);
      ctx.restore();

      drawRhythmHud(ctx, rhythm);
      if (d.phase === "roundEnd") drawDuelBanner(ctx, scene);
      if (playing) drawRhythmFlash(ctx, shake);
      panelEl.classList.add("hidden");
    } else {
      // Regular Duel (untouched)
      approach = APPROACH;
      lastProjected = null;
      drawDuelGround(ctx, scene);
      drawDuelShots(ctx, scene);
      drawDuelBursts(ctx, scene);
      drawDuelOver(ctx, scene);
      updateDuelShop(shopEl, view, side || PLAYER, { watching: !side });
      updateDuelUnitPanel(panelEl, view, side || PLAYER, drag ? null : picked());
    }
  }

  // ---------------------------------------------------------- the pointer

  function unitAt(pos) {
    let best = null;
    let bestD = Infinity;
    for (const u of army()) {
      const d = Math.hypot(u.x - pos.x, u.y - pos.y);
      if (d <= DUEL_UNITS[u.type].radius + GRAB && d < bestD) {
        best = u;
        bestD = d;
      }
    }
    return best;
  }

  const playingKeys = () => Boolean(!remote && state && state.musical && state.phase === "combat" && !state.paused);
  function pressLane(lane) {
    const result = pressKey(state, PLAYER, lane);
    if (!result.ok) return;
    presses[lane] = { age: 0, hit: result.hit };
    if (!result.hit) playSound("error");
  }
  function releaseLane(lane) {
    const result = releaseKey(state, PLAYER, lane);
    if (result.ok && result.held === false) {
      presses[lane] = { age: 0, hit: false };
      playSound("error");
    }
  }

  function key(code, repeat = false) {
    const lane = KEY_LANE[code];
    if (!lane || remote || !state || !state.musical) return false;
    if (!repeat && playingKeys()) pressLane(lane);
    return true;
  }

  function keyUp(code) {
    const lane = KEY_LANE[code];
    if (lane && playingKeys()) releaseLane(lane);
  }

  function pointerDown(pos) {
    if (playingKeys()) {
      const lane = laneAt(pos);
      if (lane) pressLane(lane);
      fingerLane = lane;
      return;
    }
    if (!shopping()) return;
    // Musical Duel Buy Phase: click directly on any photorealistic blue vehicle in the 3D arena!
    if (!remote && state && state.musical) {
      const unit = photoStage.pickUnit(pos, lastProjected, army());
      selectedId = unit ? unit.id : null;
      press = null;
      drag = null;
      return;
    }
    const unit = unitAt(pos);
    selectedId = unit ? unit.id : null;
    press = unit ? { id: unit.id, x: pos.x, y: pos.y, offX: unit.x - pos.x, offY: unit.y - pos.y, moved: false } : null;
    drag = null;
  }

  function pointerMove(pos) {
    if (!press || !shopping()) return;
    if (!press.moved && Math.hypot(pos.x - press.x, pos.y - press.y) < DRAG_AFTER) return;
    press.moved = true;
    const unit = army().find((u) => u.id === press.id);
    if (!unit) return;
    const x = pos.x + press.offX;
    const y = pos.y + press.offY;
    drag = { id: unit.id, x, y, ok: canPlace(duel(), mySide(), x, y, DUEL_UNITS[unit.type].radius, unit.id) };
  }

  function pointerUp() {
    if (fingerLane) {
      if (playingKeys()) releaseLane(fingerLane);
      fingerLane = null;
      return;
    }
    if (press && drag && shopping()) {
      const { id, x, y, ok } = drag;
      if (remote && !ok) {
        refuse("blocked");
      } else {
        if (remote) settle = { id, x, y, ok: true, until: clock + SETTLE };
        act(() => moveUnit(state, PLAYER, id, x, y), { type: "duelMove", id, x, y });
      }
    }
    press = null;
    drag = null;
  }

  function leave() {
    if (music) music.stop();
    photoStage.reset();
    lastProjected = null;
    shopHiddenForMusical = false;
    if (hangarEl) hangarEl.classList.add("hidden");
    hideDuelResult(resultEl);
    panelEl.classList.add("hidden");
    selectedId = null;
    press = null;
    drag = null;
    settle = null;
  }

  function renderLobby(el, startDuel, { versus = false } = {}) {
    const now = loadProfile(storage);
    const again = () => renderLobby(el, startDuel, { versus });
    renderDuelLobby(
      el,
      now,
      {
        onStart: startDuel,
        onAssign(type, skill) {
          const result = assignPoint(now, type, skill);
          if (!result.ok) return;
          saveProfile(result.profile, storage);
          again();
        },
        onReset() {
          saveProfile({ ...now, points: {} }, storage);
          again();
        },
      },
      { versus },
    );
  }

  function hush() {
    if (music) music.stop();
  }

  return { start, mount, frame, ready, key, keyUp, pointerDown, pointerMove, pointerUp, leave, hush, renderLobby };
}
