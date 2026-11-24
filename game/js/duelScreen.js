// A duel against the computer, run in the browser (docs/2026-11-22-duelo-
// design.md §9, §10): this holds the duel under way and is the go-between
// of the page and the game -- duel.js plays it, duelAI.js takes the rival's
// turns, duelDraw.js paints it, duelUI.js fills its panels, duelProfile.js
// remembers what the player gained.
//
// main.js hands it every frame and every press of the pointer while a
// duel is on (the game's mode is "duel"); it never looks at the page
// beyond the elements it is given.
import {
  DUEL_UNITS,
  createDuelState,
  stepDuel,
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
} from "./duelUI.js";
import { drawDuel, BURST_TIME } from "./duelDraw.js";

// The player is always the left-hand side against the computer.
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
};
const GRAB = 12; // px round a unit within which a press takes it (a finger is wide)
const DRAG_AFTER = 6; // px the pointer moves before a press is a drag, not a tap

// ctx: the canvas's. shopEl, panelEl: the elements the shop and the unit
// panel go in (the attack mode's, see mount()).
// resultEl: where the duel's result shows. drawUnit(unit, target): main.js's
// drawing of a unit off its sheets. resetVisuals(): forget how units
// looked (a new duel's units reuse the last one's ids). onRematch(arena),
// onExit(): the result's two buttons.
export function createDuelScreen({ ctx, shopEl, panelEl, resultEl, drawUnit, resetVisuals, playSound, showToast, onRematch, onExit, storage }) {
  let state = null;
  let arena = 1;
  let grade = 1;
  let profile = null;
  let selectedId = null;
  let press = null; // { id, x, y, offX, offY, moved }: a unit under the pointer, held
  let drag = null; // { id, x, y, ok }: where the held unit would go
  let bursts = [];
  let scorch = [];
  let seenShots = new WeakSet();
  let fallen = new Set();
  let lastPhase = "buy";
  let recorded = false;

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

  // A new duel in this arena against the computer of its league. Returns
  // the duel's state: main.js's game while it lasts.
  function start(arenaId) {
    profile = loadProfile(storage);
    // An arena of a league not reached yet is not played (the menu doesn't
    // offer it either).
    arena = Math.min(arenaOf(arenaId).id, profile.league);
    grade = arena;
    const seed = Math.floor(Math.random() * 0x7fffffff);
    state = createDuelState({ arena, seed, left: startOf(profile), right: gradeStart(grade, seed) });
    state.paused = false;
    selectedId = null;
    press = null;
    drag = null;
    bursts = [];
    scorch = [];
    seenShots = new WeakSet();
    fallen = new Set();
    lastPhase = "buy";
    recorded = false;
    hideDuelResult(resultEl);
    resetVisuals();
    picturesOf(arena);
    playTurn(state, RIVAL, grade); // the computer shops first, and waits
    return state;
  }

  // Puts the duel's shop and unit panel in their elements. They are the
  // attack mode's: main.js puts that mode's back when the duel is left.
  function mount() {
    mountDuelShop(shopEl, {
      onBuy(type) {
        const result = buyUnit(state, PLAYER, type);
        if (result.ok) selectedId = result.unit.id;
        else refuse(result.reason);
      },
      onReady: ready,
    });
    mountDuelUnitPanel(panelEl, {
      onUpgrade(skill) {
        const unit = picked();
        if (!unit) return;
        const result = upgradeUnit(state, PLAYER, unit.type, skill);
        if (!result.ok) refuse(result.reason);
      },
      onSell() {
        const result = sellUnit(state, PLAYER, selectedId);
        if (result.ok) selectedId = null;
        else refuse(result.reason);
      },
      onClose() {
        selectedId = null;
      },
    });
    shopEl.classList.remove("hidden");
  }

  function refuse(reason) {
    playSound("error");
    showToast(REFUSED[reason] || "No se puede");
  }

  const shopping = () => state.phase === "buy" && !state.sides[PLAYER].ready;
  const picked = () => (state.phase === "buy" ? state.sides[PLAYER].army.find((u) => u.id === selectedId) : null) || null;

  // «¡Listo!»
  function ready() {
    if (!state || !shopping()) return;
    if (state.sides[PLAYER].army.length === 0) return refuse("empty-army");
    selectedId = null;
    setReady(state, PLAYER);
    watch();
  }

  // What changed since the last look: a phase begun, shots fired, units
  // fallen. Sounds, marks on the ground and the rival's next turn hang on
  // it.
  function watch() {
    if (state.phase !== lastPhase) {
      if (state.phase === "combat") {
        fallen = new Set();
        scorch = [];
        press = null;
        drag = null;
      } else if (state.phase === "buy") {
        playTurn(state, RIVAL, grade);
        showToast(`Asalto ${state.round}`);
      } else if (state.phase === "over") {
        finish();
      }
      lastPhase = state.phase;
    }
    for (const shot of state.shots) {
      if (seenShots.has(shot)) continue;
      seenShots.add(shot);
      playSound(SHOT_SOUND[shot.type]);
    }
    for (const u of state.units) {
      if (u.alive || fallen.has(u.id)) continue;
      fallen.add(u.id);
      bursts.push({ x: u.x, y: u.y, age: 0, size: u.radius * 2.2 });
      scorch.push({ x: u.x, y: u.y, r: u.radius });
      playSound("cannon");
    }
  }

  // The duel is over: the profile takes what it brought, and the result
  // shows.
  function finish() {
    if (recorded) return;
    recorded = true;
    const outcome = recordDuel(profile, { arena, won: state.winner === PLAYER, xp: state.sides[PLAYER].xp, rival: "computer" });
    profile = outcome.profile;
    saveProfile(profile, storage);
    showDuelResult(resultEl, duelResult(state, PLAYER, outcome.gained, profile), {
      onRematch: () => onRematch(arena),
      onExit,
    });
  }

  // One frame: the duel moves on (unless it is paused or behind a menu:
  // `running`), then everything is drawn and the panels brought up to date.
  function frame(dt, { running = true } = {}) {
    if (!state) return;
    const live = running && !state.paused;
    if (live) {
      stepDuel(state, dt);
      watch();
      for (const burst of bursts) burst.age += dt;
      bursts = bursts.filter((burst) => burst.age < BURST_TIME);
    }
    // While shopping, what the player may see of the rival; in a fight
    // nothing is hidden, and the duel itself serves.
    const view = state.phase === "buy" ? duelView(state, PLAYER) : state;
    const art = picturesOf(arena);
    drawDuel(ctx, {
      view,
      side: PLAYER,
      map: loaded(art.map),
      foreground: loaded(art.foreground),
      drawUnit,
      selectedId,
      drag,
      scorch,
      bursts,
      paused: Boolean(state.paused),
    });
    updateDuelShop(shopEl, view, PLAYER);
    // The panel gets out of the way of a unit being dragged.
    updateDuelUnitPanel(panelEl, view, PLAYER, drag ? null : picked());
  }

  // ---------------------------------------------------------- the pointer
  // A press on one of the player's units picks it; moved while held, the
  // unit is dragged to a new place of its zone. `pos`: in the arena.

  function unitAt(pos) {
    let best = null;
    let bestD = Infinity;
    for (const u of state.sides[PLAYER].army) {
      const d = Math.hypot(u.x - pos.x, u.y - pos.y);
      if (d <= DUEL_UNITS[u.type].radius + GRAB && d < bestD) {
        best = u;
        bestD = d;
      }
    }
    return best;
  }

  function pointerDown(pos) {
    if (!state || !shopping()) return;
    const unit = unitAt(pos);
    selectedId = unit ? unit.id : null;
    press = unit ? { id: unit.id, x: pos.x, y: pos.y, offX: unit.x - pos.x, offY: unit.y - pos.y, moved: false } : null;
    drag = null;
  }

  function pointerMove(pos) {
    if (!state || !press || !shopping()) return;
    if (!press.moved && Math.hypot(pos.x - press.x, pos.y - press.y) < DRAG_AFTER) return;
    press.moved = true;
    const unit = state.sides[PLAYER].army.find((u) => u.id === press.id);
    if (!unit) return;
    const x = pos.x + press.offX;
    const y = pos.y + press.offY;
    drag = { id: unit.id, x, y, ok: canPlace(state, PLAYER, x, y, DUEL_UNITS[unit.type].radius, unit.id) };
  }

  function pointerUp() {
    if (!state) return;
    if (press && drag && shopping()) {
      const result = moveUnit(state, PLAYER, drag.id, drag.x, drag.y);
      if (!result.ok) refuse(result.reason);
    }
    press = null;
    drag = null;
  }

  // The duel is left (another game, or the main menu): its result and its
  // button go.
  function leave() {
    hideDuelResult(resultEl);
    panelEl.classList.add("hidden");
    selectedId = null;
    press = null;
    drag = null;
  }

  // The profile's screen in the menu, in `el`; start(arena) is called for
  // the arena picked.
  function renderLobby(el, startDuel) {
    const now = loadProfile(storage);
    const again = () => renderLobby(el, startDuel);
    renderDuelLobby(el, now, {
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
    });
  }

  return { start, mount, frame, ready, pointerDown, pointerMove, pointerUp, leave, renderLobby };
}
