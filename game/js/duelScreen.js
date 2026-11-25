// A duel, run in the browser (docs/2026-11-22-duelo-design.md §9-§11):
// the go-between of the page and the game. It runs a duel in one of two
// ways:
//   - against the computer: it holds the duel itself -- duel.js plays it,
//     duelAI.js takes the rival's turns;
//   - against another player at home: the home server holds it (host.js).
//     The screen draws what the server last sent and posts the player's
//     actions; what they do shows with the server's next news.
// Either way duelDraw.js paints it, duelUI.js fills its panels and
// duelProfile.js remembers what the player gained.
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
  renderDuelLobby,
  showDuelResult,
  hideDuelResult,
  duelResult,
  duelNotice,
} from "./duelUI.js";
import { drawDuel, BURST_TIME } from "./duelDraw.js";
import { BOT_ACCURACY, createMusicalDuel, stepMusicalDuel, pressKey, releaseKey, songClock, beginFight } from "./duelRhythm.js";
import { drawRhythm, laneAt } from "./duelRhythmDraw.js";

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

// ctx: the canvas's. shopEl, panelEl: the elements the shop and the unit
// panel go in (the attack mode's, see mount()). resultEl: where the duel's
// result shows. drawUnit(unit, target): main.js's drawing of a unit off its
// sheets. resetVisuals(): forget how units looked (a new duel's units reuse
// the last one's ids). onRematch(arena, { musical }), onExit(): the result's
// two buttons after a duel against the computer. music: plays a musical
// duel's song (duelMusic.js).
export function createDuelScreen({ ctx, shopEl, panelEl, resultEl, drawUnit, resetVisuals, playSound, showToast, onRematch, onExit, storage, music }) {
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
  // --- a musical duel: the keys just pressed ({ [lane]: { age, hit } }), and
  // the hits and mistakes already heard
  let presses = {};
  let seenEvents = new WeakSet();
  let fingerLane = null; // the key a finger on the track is holding down
  let loading = false; // its song's recording hasn't come yet

  // The arenas' pictures, fetched when first needed.
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
    if (music) music.stop();
    hideDuelResult(resultEl);
    resetVisuals();
  }

  // A new duel in this arena against the computer of its league. Returns
  // the duel's state: main.js's game while it lasts. `musical`: its fights
  // are played on the keyboard, to the league's song (duelRhythm.js).
  function start(arenaId, { musical = false } = {}) {
    remote = null;
    profile = loadProfile(storage);
    // An arena of a league not reached yet is not played (the menu doesn't
    // offer it either).
    arena = Math.min(arenaOf(arenaId).id, profile.league);
    grade = arena;
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const options = { arena, seed, left: startOf(profile), right: gradeStart(grade, seed) };
    state = musical ? createMusicalDuel({ ...options, bots: { [RIVAL]: BOT_ACCURACY[grade - 1] } }) : createDuelState(options);
    // (A recorded song is fetched while the player shops.)
    if (musical && music) music.load(state.musical.song);
    state.paused = false;
    forget();
    picturesOf(arena);
    playTurn(state, RIVAL, grade); // the computer shops first, and waits
    return state;
  }

  // ---------------------------------------------------------- the actions
  // Against the computer they are done at once; on the home network they
  // are posted, and the server's answer says whether they were accepted.

  function refuse(reason) {
    playSound("error");
    showToast(REFUSED[reason] || "No se puede");
  }

  // local(): does it here; body: what to post to the server instead.
  // then(result): with the accepted action's result.
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

  // Puts the duel's shop and unit panel in their elements. They are the
  // attack mode's: main.js puts that mode's back when the duel is left.
  function mount() {
    mountDuelShop(shopEl, {
      onBuy(type) {
        act(() => buyUnit(state, PLAYER, type), { type: "duelBuy", unitType: type }, (result) => {
          selectedId = result.unit.id;
        });
      },
      onReady: ready,
    });
    mountDuelUnitPanel(panelEl, {
      onUpgrade(skill) {
        const unit = picked();
        if (unit) act(() => upgradeUnit(state, PLAYER, unit.type, skill), { type: "duelUpgrade", unitType: unit.type, skill });
      },
      onSell() {
        const id = selectedId;
        act(() => sellUnit(state, PLAYER, id), { type: "duelSell", id }, () => {
          if (selectedId === id) selectedId = null;
        });
      },
      onClose() {
        selectedId = null;
      },
    });
    shopEl.classList.remove("hidden");
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
  // A phase begun, shots fired, units fallen: sounds, marks on the ground,
  // the computer's next turn and the end of the duel hang on it.

  function watch() {
    const d = duel();
    if (d.phase !== lastPhase) {
      if (d.phase === "combat") {
        fallen = new Set();
        scorch = [];
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
      // The server sends its shots anew with every piece of news: one is
      // new if it was fired since the last.
      if (remote ? shot.age >= NEWS_EVERY : seenShots.has(shot)) continue;
      seenShots.add(shot);
      playSound(SHOT_SOUND[shot.type]);
    }
    // A musical duel: a key of the player's that went by is heard (a wrong
    // one was, when it was pressed).
    for (const event of d.musical ? d.musical.events : []) {
      if (seenEvents.has(event)) continue;
      seenEvents.add(event);
      if (event.side === mySide() && event.kind === "miss") playSound("error");
    }
    for (const u of d.units) {
      if (u.alive || fallen.has(u.id)) continue;
      fallen.add(u.id);
      bursts.push({ x: u.x, y: u.y, age: 0, size: u.radius * 2.2 });
      scorch.push({ x: u.x, y: u.y, r: u.radius });
      playSound("cannon");
    }
  }

  // The duel is over: the profile takes what it brought, and the result
  // shows. Between two players it is counted once, by the duel's dice: a
  // reload of the page after the end doesn't count it again.
  function finish() {
    if (recorded) return;
    recorded = true;
    const d = duel();
    const side = mySide();
    if (!side) return; // watching: nothing to gain, nothing to show
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
    // (The musical duel is on trial: it leaves the profile as it was.)
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

  // The server's news, as it comes: main.js replaces its state several
  // times a second.
  function takeNews() {
    if (remote.state === lastNews) return;
    prevNews = lastNews;
    lastNews = remote.state;
    newsAt = clock;
    if (selectedId != null && !army().some((u) => u.id === selectedId)) selectedId = null;
    watch();
  }

  // The latest news with the fight's units drawn partway from where they
  // were in the news before it, and the shots aged on: between two pieces
  // of news nothing would move otherwise.
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

  // One frame. Against the computer the duel moves on here (unless it is
  // paused or behind a menu: `running`); on the home network (`remote`: {
  // state, net, ask, address } from main.js) the server's news is taken.
  // Then everything is drawn and the panels brought up to date.
  function frame(dt, { running = true, remote: news = null } = {}) {
    if (news && !remote) forget(); // from a duel of this screen's to the server's
    remote = news;
    const d = duel();
    if (!d) return;
    clock += dt;
    if (remote) takeNews();
    else if (running && !d.paused) {
      // A musical duel's song plays while its fight goes on. One written as
      // notes follows the game's time; a recorded one leads it: the fight
      // moves on by as much as has been heard, and waits for the recording
      // if it hasn't come yet.
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
      if (step > 0) stepMusicalDuel(state, step); // (any duel: only a musical one's fight is its own)
      watch();
    } else if (music) {
      music.stop();
    }
    const playing = Boolean(!remote && d.musical && d.phase === "combat");
    for (const lane of Object.keys(presses)) presses[lane].age += dt;
    if (remote ? !d.paused : running && !d.paused) {
      for (const burst of bursts) burst.age += dt;
      bursts = bursts.filter((burst) => burst.age < BURST_TIME);
    }
    if (settle && clock > settle.until) settle = null;

    const side = mySide();
    const view = remote ? between() : seen();
    const art = picturesOf(d.arena);
    drawDuel(ctx, {
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
      // (On the home network a duel is also stopped while it waits for a
      // player: the notice says so, not «PAUSA».)
      paused: Boolean(d.paused) && !(remote && (remote.net.waiting || remote.net.gone)),
    });
    if (playing) drawRhythm(ctx, { view, side: side || PLAYER, presses, paused: Boolean(d.paused), loading });
    updateDuelShop(shopEl, view, side || PLAYER, { watching: !side });
    // The panel gets out of the way of a unit being dragged.
    updateDuelUnitPanel(panelEl, view, side || PLAYER, drag ? null : picked());
  }

  // ---------------------------------------------------------- the pointer
  // A press on one of the player's units picks it; moved while held, the
  // unit is dragged to a new place of its zone. `pos`: in the arena.

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

  // A musical duel's fight: this key of the song is pressed.
  const playingKeys = () => Boolean(!remote && state && state.musical && state.phase === "combat" && !state.paused);
  function pressLane(lane) {
    const result = pressKey(state, PLAYER, lane);
    if (!result.ok) return;
    presses[lane] = { age: 0, hit: result.hit };
    if (!result.hit) playSound("error");
  }
  // ...and let go: it matters to a long key.
  function releaseLane(lane) {
    const result = releaseKey(state, PLAYER, lane);
    if (result.ok && result.held === false) {
      presses[lane] = { age: 0, hit: false };
      playSound("error");
    }
  }

  // A key of the keyboard goes down (`code`: the event's; `repeat`: it is
  // being held). True if it was the duel's: one of a musical duel's keys,
  // while one is on.
  function key(code, repeat = false) {
    const lane = KEY_LANE[code];
    if (!lane || remote || !state || !state.musical) return false;
    if (!repeat && playingKeys()) pressLane(lane);
    return true;
  }

  // ...and comes up.
  function keyUp(code) {
    const lane = KEY_LANE[code];
    if (lane && playingKeys()) releaseLane(lane);
  }

  function pointerDown(pos) {
    if (playingKeys()) {
      // A finger on the track presses its lane's key.
      const lane = laneAt(pos);
      if (lane) pressLane(lane);
      fingerLane = lane;
      return;
    }
    if (!shopping()) return;
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
        // A drop the server would refuse isn't even sent.
        refuse("blocked");
      } else {
        // On the home network the unit stays where it was dropped until
        // the server's word comes.
        if (remote) settle = { id, x, y, ok: true, until: clock + SETTLE };
        act(() => moveUnit(state, PLAYER, id, x, y), { type: "duelMove", id, x, y });
      }
    }
    press = null;
    drag = null;
  }

  // The duel is left (another game, or the main menu): its result and its
  // panel go.
  function leave() {
    if (music) music.stop();
    hideDuelResult(resultEl);
    panelEl.classList.add("hidden");
    selectedId = null;
    press = null;
    drag = null;
    settle = null;
  }

  // The duel's screen in the menu, in `el`: the profile and its arenas, or
  // (versus: against another player at home) the five arenas, all open.
  // startDuel(arena) is called for the arena picked.
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

  // The page is out of sight (no frames will come): a song is not left
  // playing by itself.
  function hush() {
    if (music) music.stop();
  }

  return { start, mount, frame, ready, key, keyUp, pointerDown, pointerMove, pointerUp, leave, hush, renderLobby };
}
