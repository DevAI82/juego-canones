// The game the home server runs (server.js), without the HTTP: every
// browser at home polls it and sends it actions. It holds one game at a
// time, of one of two kinds (docs/2026-10-09-uno-contra-otro-design.md §4):
//   - "coop": «Defender juntos», the defence game everybody plays together
//     -- any tab may do anything, as it always could;
//   - "versus": «Uno contra otro», an attack with a person defending
//     (attack.js's defender "player"): one tab defends, one attacks
//     (versus.js keeps who), and each may only act for its own side.
// It ticks the game, makes the autosaves (autosave.js), runs the automatic
// army for an attacker playing on a phone (autoArmy.js), and answers each
// tab with the game as that tab needs it (viewJson).
//
// `store`: where the saves go -- { read(): Promise<{ auto, 1, 2, 3 }>,
// write(slot, save): Promise } (server-saves.js on the server's PC; a plain
// object in the tests). `now()`: the time in ms (a fake clock in tests).
import {
  createGameState,
  startNextLevel,
  placeTower,
  upgradeTower,
  repairStructure,
  sellStructure,
  placeWall,
  skipWave,
  togglePause,
} from "./simulate.js";
import {
  createAttackState,
  buyUnits,
  upgradeUnitType,
  setEntry,
  orderMove,
  orderAttack,
  orderEnter,
  orderStop,
} from "./attack.js";
import { stepGame, canSaveGame, createGameSave, restoreGameSave } from "./modes.js";
import { createSaveScheduler } from "./autosave.js";
import { createAutoArmy } from "./autoArmy.js";
import { fogForWire } from "./fog.js";
import { DIFFICULTIES } from "./defenseAI.js";
import { MAX_LEVEL } from "./levels.js";
import {
  SIDES,
  createSeats,
  sit,
  seen,
  sideOf,
  isConnected,
  checkGone,
  ready,
  pause,
  resume,
  mayChangeGame,
  swapSides,
} from "./versus.js";

const AUTO_ARMY_EVERY = 0.25; // s between the automatic army's looks, as in solo play

const isVersus = (state) => state.mode === "attack" && state.attack.defender === "player";

// What travels to the browsers, out of the state: the units' whole routes
// stay behind, a shot only says where its target is, and the attacker's fog
// goes in its wire form (fog.js).
function forBrowsers(key, value) {
  if (key === "path") return undefined;
  if (key === "target" && value) return { id: value.id, x: value.x, y: value.y };
  if (key === "fog" && value && value.explored instanceof Uint8Array) return fogForWire(value);
  return value;
}

export function createHost({ store, now = () => Date.now(), initial = null, log = () => {} }) {
  // A save that can't be played here (an attack against the computer is
  // solo only) starts a fresh co-op game instead.
  let state = initial && (initial.mode !== "attack" || isVersus(initial)) ? initial : createGameState();
  // Who plays which side, in a versus game (null in co-op). A game resumed
  // from its save starts with both sides free.
  let seats = isVersus(state) ? createSeats() : null;
  const autoArmy = createAutoArmy();
  let autoClock = 0;

  const saves = createSaveScheduler((slot, save) => {
    store.write(slot, save).catch((err) => log(`Couldn't save (slot ${slot}): ${err.message}`));
    return true;
  });
  saves.reset(state, { saved: Boolean(initial) });

  // A new game for everyone: `nextSeats` (versus) or none (co-op).
  function setGame(next, nextSeats, { saved = false } = {}) {
    state = next;
    seats = nextSeats;
    autoArmy.reset();
    saves.reset(state, { saved });
  }

  const ok = { ok: true };
  const refuse = (reason) => ({ ok: false, reason });
  const level = (v) => (Number.isInteger(v) && v >= 1 && v <= MAX_LEVEL ? v : 1);
  const moneyLevel = (v) => (DIFFICULTIES[v] ? v : "normal");

  // The defence's actions: anyone's in co-op, the defender's in versus.
  const defence = {
    place: (b) => placeTower(state, b.towerType, b.x, b.y),
    upgrade: (b) => upgradeTower(state, b.towerId, b.skill),
    repair: (b) => repairStructure(state, b.id ?? b.towerId),
    sell: (b) => sellStructure(state, b.id ?? b.towerId),
    placeWall: (b) => placeWall(state, b.x, b.y),
  };
  // The attacker's, in versus only.
  const attack = {
    buy: (b) => buyUnits(state, b.unitType, Math.max(1, Math.floor(Number(b.count) || 1))),
    upgradeUnit: (b) => upgradeUnitType(state, b.unitType, b.skill),
    entry: (b) => setEntry(state, b.index),
    order: (b) => {
      const ids = Array.isArray(b.ids) ? b.ids : [];
      if (b.kind === "move") return orderMove(state, ids, Number(b.x), Number(b.y));
      if (b.kind === "attack") return orderAttack(state, ids, b.targetId);
      if (b.kind === "enter") return orderEnter(state, ids);
      if (b.kind === "stop") return orderStop(state, ids);
      return refuse("unknown-order");
    },
  };

  async function act(playerId, body = {}) {
    const t = now();
    const side = seats ? sideOf(seats, playerId) : null;
    const type = body.type;

    if (defence[type]) {
      if (seats && side !== "defense") return refuse("not-your-side");
      return defence[type](body);
    }
    if (attack[type]) {
      if (!seats || side !== "attack") return refuse("not-your-side");
      return attack[type](body);
    }

    switch (type) {
      case "skip":
        return seats ? refuse("wrong-game") : skipWave(state);
      case "nextLevel": {
        if (seats) return refuse("wrong-game");
        const fresh = startNextLevel(state);
        if (!fresh) return refuse("cannot-advance");
        setGame(fresh, null);
        return { ok: true, level: fresh.level };
      }
      case "pause": {
        // ⏸ toggles; the menu says which it wants (`on`).
        const on = typeof body.on === "boolean" ? body.on : !state.paused;
        if (!seats) {
          if (on !== state.paused) togglePause(state);
          return ok;
        }
        if (!side) return refuse("not-seated");
        return on ? pause(seats, state, side) : resume(seats, state, side, t);
      }
      case "ready":
        if (!seats || !side) return refuse("not-seated");
        return ready(seats, state, side, t);
      case "join":
        if (!seats) return refuse("wrong-game");
        return sit(seats, body.side, playerId, t);
      case "restart":
        // «Defender juntos»: a new co-op game on the chosen level.
        if (seats && !mayChangeGame(seats, playerId, t)) return refuse("game-in-progress");
        setGame(createGameState(level(body.level)), null);
        return ok;
      case "newVersus": {
        // «Uno contra otro»: whoever creates it takes their side; the other
        // stays free for the second player to join.
        if (!SIDES.includes(body.side)) return refuse("no-such-side");
        if (seats && !mayChangeGame(seats, playerId, t)) return refuse("game-in-progress");
        const next = createAttackState(level(body.level), moneyLevel(body.money), { defender: "player" });
        const nextSeats = createSeats();
        sit(nextSeats, body.side, playerId, t);
        setGame(next, nextSeats);
        return ok;
      }
      case "rematch": {
        // The same map and money, each player on the other side.
        if (!seats || !side) return refuse("not-seated");
        if (!state.gameOver) return refuse("not-over");
        const next = createAttackState(state.level, state.attack.difficulty, { defender: "player" });
        swapSides(seats);
        setGame(next, seats);
        return ok;
      }
      case "save": {
        const slot = Number(body.slot);
        if (![1, 2, 3].includes(slot)) return refuse("bad-slot");
        if (seats && !side) return refuse("not-seated");
        if (state.gameOver || state.win || state.levelComplete) return refuse("game-over");
        if (!canSaveGame(state)) {
          saves.request(slot, state);
          return { ok: true, queued: true };
        }
        try {
          await store.write(slot, createGameSave(state));
          return { ok: true, queued: false };
        } catch {
          return refuse("write-failed");
        }
      }
      case "load": {
        if (seats && !mayChangeGame(seats, playerId, t)) return refuse("game-in-progress");
        const slot = body.slot === "auto" ? "auto" : Number(body.slot);
        const restored = restoreGameSave((await store.read())[slot]);
        if (!restored) return refuse("unreadable");
        if (restored.mode === "attack" && !isVersus(restored)) return refuse("solo-only");
        // Whoever was playing one against the other keeps their side; any
        // side nobody holds is free to join.
        const nextSeats = isVersus(restored) ? seats || createSeats() : null;
        if (nextSeats) {
          nextSeats.pausedBy = null;
          nextSeats.gone = null;
          for (const s of SIDES) nextSeats[s].ready = false;
        }
        setGame(restored, nextSeats, { saved: true }); // «Continuar» now means this game
        return ok;
      }
      default:
        return refuse("unknown-action");
    }
  }

  // One tick of the server's loop: a side gone mid-round pauses the game,
  // saves due now are made, the game moves on, and an attacker playing on
  // a phone has their army sent in for them.
  function tick(dt) {
    if (seats) checkGone(seats, state, now());
    saves.tick(state);
    stepGame(state, dt);
    if (seats && seats.attack.auto && isConnected(seats, "attack", now()) && !state.paused) {
      autoClock += dt;
      if (autoClock >= AUTO_ARMY_EVERY) {
        autoClock = 0;
        autoArmy.step(state);
      }
    }
  }

  // What a tab gets when it asks for news (and, asking, says it's still
  // there): the game, and where it stands in it -- its side, the two
  // sides', whose pause it is, whether it may change the game.
  function viewJson(playerId, { auto } = {}) {
    const t = now();
    let net = { kind: "coop", you: null, mayChange: true };
    if (seats) {
      const you = seen(seats, playerId, t, { auto });
      const sideInfo = (s) => ({ taken: seats[s].player != null, connected: isConnected(seats, s, t), ready: seats[s].ready });
      net = {
        kind: "versus",
        you,
        sides: { defense: sideInfo("defense"), attack: sideInfo("attack") },
        pausedBy: seats.pausedBy,
        gone: seats.gone,
        mayChange: mayChangeGame(seats, playerId, t),
      };
    }
    return JSON.stringify({ state, net }, forBrowsers);
  }

  return { act, tick, viewJson, get state() { return state; } };
}
