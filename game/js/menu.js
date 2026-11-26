// The main menu and the in-game pause menu, per user request (see
// docs/2026-10-08-menu-y-guardado-design.md): one overlay, #menu, holding
// every screen, opened either as the main menu (its home screen, over a
// darkened map) or as the pause menu. This module only shows screens and
// reports what the player picked; main.js does the starting, loading and
// saving, through `handlers`:
//   networked           -- the co-op game at home (server.js)
//   listSaves()         -- Promise of [{ slot, status, summary }] (saves.js)
//   canStore()          -- whether saves can be kept here at all
//   canSaveNow()        -- between waves (otherwise a save waits)
//   hasGame()           -- a solo game is going on behind the menu
//   getSettings()       -- { music, effects }
//   attacking()         -- the game behind the menu is an attack
//   onContinue(), onNewGame(level, options), onLoad(slot), onSave(slot),
//     (options: { mode: "attack", difficulty } for an attack;
//      { mode: "versus", side, money } for one against the other at home)
//   onJoin(side)         -- one against the other: take that free side
//   onRecords(), onQuitToMain(), onResume(), onSettingsChange(settings)

const SLOT_NAMES = { auto: "Autoguardado", 1: "Hueco 1", 2: "Hueco 2", 3: "Hueco 3" };
const pad = (n) => String(n).padStart(2, "0");

export const DIFFICULTY_NAMES = { easy: "Fácil", normal: "Normal", hard: "Difícil" };
// The same levels as the money of a defence played by a person, one
// against the other (docs/2026-10-09-uno-contra-otro-design.md §4).
export const MONEY_NAMES = { easy: "Poco", normal: "Normal", hard: "Mucho" };

// "Defensa · Nivel 4 · Oleada 12 · ❤ 15 · $320 · 08/10 18:30", "Ataque ·
// Nivel 3 · Ronda 5 · Difícil · ❤ 12 · $240 · ..." or "Uno contra otro ·
// Nivel 2 · Ronda 5 · ❤ 12 · ...": a save as the menu lists it, the date
// in this device's own time. A summary without a mode is a defence game's.
export function describeSave(summary) {
  const when = summary.savedAt ? new Date(summary.savedAt) : null;
  const date =
    when && !Number.isNaN(when.getTime())
      ? ` · ${pad(when.getDate())}/${pad(when.getMonth() + 1)} ${pad(when.getHours())}:${pad(when.getMinutes())}`
      : "";
  if (summary.mode === "attack" && summary.defender === "player") {
    return `Uno contra otro · Nivel ${summary.level} · Ronda ${summary.round} · ❤ ${summary.lives}${date}`;
  }
  if (summary.mode === "attack") {
    const difficulty = DIFFICULTY_NAMES[summary.difficulty] || DIFFICULTY_NAMES.normal;
    return `Ataque · Nivel ${summary.level} · Ronda ${summary.round} · ${difficulty} · ❤ ${summary.lives} · $${summary.money}${date}`;
  }
  if (summary.mode === "rts") {
    const submodeName = summary.submode === "survival" ? "Supervivencia" : "Campaña";
    return `RTS · ${submodeName} · Mapa ${summary.level} · $${summary.credits || 0}${date}`;
  }
  return `Defensa · Nivel ${summary.level} · Oleada ${summary.wave} · ❤ ${summary.lives} · $${summary.money}${date}`;
}

export function createMenu(root, handlers) {
  const titleEl = root.querySelector(".menu-title");
  const screens = [...root.querySelectorAll(".menu-screen")];
  const confirmEl = root.querySelector(".menu-confirm");
  const confirmText = root.querySelector(".menu-confirm-text");
  let context = null; // "main" or "pause" while open
  let current = null;
  let history = [];
  let autosaveExists = false;
  let answerConfirm = null;
  // «¿Cómo quieres jugar?» -> map -> (attacking:) difficulty: what's been
  // picked on the way.
  let chosenMode = "defense";
  let chosenLevel = null;
  let chosenSide = null;
  let duelVersus = false; // a duel against another player at home, not the computer
  let duelMusical = false; // the duel being chosen is a musical one
  let duelMath = false; // ... and a Duelo Matemático: questions for keys (duelQuiz.js)

  function open(ctx, screen) {
    context = ctx;
    history = [];
    current = null;
    root.classList.remove("hidden");
    root.classList.toggle("main", ctx === "main");
    titleEl.textContent = ctx === "main" ? "TOWER DEFENSE" : "MENÚ";
    document.body.classList.add("menu-open");
    show(screen, false);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("resize"));
  }

  function close() {
    context = null;
    root.classList.add("hidden");
    document.body.classList.remove("menu-open");
    settleConfirm(false);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("resize"));
  }

  function show(name, remember = true) {
    if (remember && current) history.push(current);
    current = name;
    // The main menu's start screen is the user's drawing, buttons and all.
    root.classList.toggle("home", context === "main" && name === "home");
    for (const el of screens) el.classList.toggle("hidden", el.dataset.screen !== name);
    if (name === "home") renderHome();
    else if (name === "load" || name === "save") renderSlots(name);
    else if (name === "settings") renderSettings();
    else if (name === "multiplayer") renderMultiplayer();
    else if (name === "mode") renderMode();
    else if (name === "levels") renderLevels();
    else if (name === "duel") renderDuel();
  }

  // "Volver", or Esc: answers a question still open with "No", else goes
  // back a screen, else (on the pause menu's own screen) closes it.
  function back() {
    if (answerConfirm) return settleConfirm(false);
    if (history.length) return show(history.pop(), false);
    if (context === "pause") {
      close();
      handlers.onResume();
    }
  }

  // A yes/no question over the current screen; resolves true for "Sí".
  function confirm(message) {
    settleConfirm(false);
    confirmText.textContent = message;
    confirmEl.classList.remove("hidden");
    return new Promise((resolve) => {
      answerConfirm = resolve;
    });
  }

  function settleConfirm(answer) {
    if (!answerConfirm) return;
    const resolve = answerConfirm;
    answerConfirm = null;
    confirmEl.classList.add("hidden");
    resolve(answer);
  }

  async function renderHome() {
    const cont = root.querySelector('[data-do="continue"]');
    const label = cont.querySelector(".menu-label");
    if (handlers.networked) {
      label.textContent = "Volver a la partida";
      cont.classList.remove("hidden");
      return;
    }
    label.textContent = "Continuar";
    cont.classList.add("hidden");
    const list = await handlers.listSaves();
    autosaveExists = list.some((e) => e.slot === "auto" && e.status === "ok");
    if (current === "home") cont.classList.toggle("hidden", !autosaveExists);
  }

  async function renderSlots(mode) {
    const screen = root.querySelector(`.menu-screen[data-screen="${mode}"]`);
    const listEl = screen.querySelector(".save-list");
    const note = screen.querySelector(".menu-note");
    listEl.textContent = "";
    if (!handlers.canStore()) note.textContent = "Este navegador no permite guardar partidas.";
    else if (mode === "save" && !handlers.canSaveNow()) {
      note.textContent = handlers.attacking()
        ? "Estás en mitad de una ronda: se guardará al empezar la siguiente."
        : "Estás en mitad de una oleada: se guardará al terminarla.";
    }
    else note.textContent = "";
    const list = await handlers.listSaves();
    if (current !== mode) return; // the player moved on while the list loaded
    for (const entry of list) {
      if (mode === "save" && entry.slot === "auto") continue;
      const row = document.createElement("div");
      row.className = "save-row";
      const name = document.createElement("span");
      name.className = "save-row-name";
      name.textContent = SLOT_NAMES[entry.slot];
      const desc = document.createElement("span");
      desc.className = "save-row-desc";
      if (entry.status === "ok") {
        desc.textContent = describeSave(entry.summary);
      } else {
        desc.textContent = entry.status === "empty" ? "Vacío" : "No se puede cargar";
        desc.classList.add("empty");
      }
      const button = document.createElement("button");
      if (mode === "load") {
        button.textContent = "Cargar";
        button.disabled = entry.status !== "ok";
        button.addEventListener("click", () => chooseLoad(entry.slot));
      } else {
        button.textContent = "Guardar aquí";
        button.disabled = !handlers.canStore();
        button.addEventListener("click", () => chooseSave(entry));
      }
      row.append(name, desc, button);
      listEl.append(row);
    }
  }

  function renderSettings() {
    const settings = handlers.getSettings();
    for (const box of root.querySelectorAll("input[data-setting]")) box.checked = Boolean(settings[box.dataset.setting]);
    for (const pick of root.querySelectorAll("select[data-setting-choice]")) pick.value = settings[pick.dataset.settingChoice] ?? pick.value;
  }

  function renderMultiplayer() {
    root.querySelector(".lan-info").textContent = handlers.networked
      ? `Estáis jugando en la red de casa: los demás aparatos se unen abriendo ${location.origin}. En «Nueva partida», «Defender juntos» o «Uno contra otro».`
      : "Para jugar en red en casa, un ordenador arranca el servidor del juego (node server.js) y los demás abren la dirección que muestra.";
    root.querySelector('[data-do="continue-lan"]').classList.toggle("hidden", !handlers.networked);
  }

  // At home (server.js): everybody defending one map, or one against the
  // other; an attack against the computer is solo only (its design §7).
  function renderMode() {
    const home = Boolean(handlers.networked);
    root.querySelector('[data-mode="attack"]').classList.toggle("hidden", home);
    root.querySelector('[data-mode="versus"]').classList.toggle("hidden", !home);
    const defense = root.querySelector('[data-mode="defense"]');
    defense.querySelector(".menu-choice-name").textContent = home ? "Defender juntos" : "Defender";
    defense.querySelector(".menu-choice-desc").textContent = home ? "Todos defendéis el mismo mapa" : "Construye torres y protege la base";
  }

  // The duel minigame's own screen: the profile and its arenas. main.js
  // fills it (duelScreen.js); picking an arena starts a duel there.
  // (duelVersus: against another player at home rather than the computer.)
  function renderDuel() {
    if (handlers.renderDuel) handlers.renderDuel(root.querySelector(".duel-lobby"), chooseDuel, { versus: duelVersus });
  }

  // A duel is never saved, so it takes no saved game's place: only a game
  // under way is asked about. One against another player is the house's
  // game, as any other at home.
  async function chooseDuel(arena) {
    if (duelVersus) {
      if (!(await confirm("Esto empezará una partida nueva para todos los jugadores. ¿Seguir?"))) return;
      return handlers.onNewGame(arena, { mode: "duelNet" });
    }
    if (handlers.hasGame() && !(await confirm("Dejarás la partida en curso. ¿Empezar el duelo?"))) return;
    handlers.onNewGame(arena, { mode: "duel" });
  }

  // The musical duel (duelRhythm.js), on trial: in the first league's
  // arena, against the computer -- or, at home, against another player on
  // their own device (duelVersus), which is the house's game as any other.
  async function chooseMusicalDuel() {
    if (duelVersus) {
      if (!(await confirm("Esto empezará una partida nueva para todos los jugadores. ¿Seguir?"))) return;
      return handlers.onNewGame(1, { mode: "duelNet", musical: true, math: duelMath });
    }
    if (handlers.hasGame() && !(await confirm("Dejarás la partida en curso. ¿Empezar el duelo?"))) return;
    handlers.onNewGame(1, { mode: "duel", musical: true, math: duelMath });
  }

  function renderLevels() {
    root.querySelector('[data-screen="levels"] .menu-subtitle').textContent =
      chosenMode === "attack" ? "Elige el mapa que atacarás" : chosenMode === "versus" ? "Elige el mapa" : "Elige nivel";
  }

  // One against the other, a tab without a side (main.js): the free sides to
  // join -- or, both taken, that there's a game going on. `info`: { level,
  // money, free: the free sides }.
  function renderSeat(info) {
    const join = info.free.length > 0;
    for (const el of screens) el.classList.toggle("hidden", el.dataset.screen !== (join ? "join" : "full"));
    current = join ? "join" : "full";
    root.classList.remove("home"); // (the start screen's own layout)
    if (!join) return;
    if (info.kind === "duel") {
      // A duel waiting for its second player: one side to take.
      root.querySelector(".join-info").textContent = `${info.math ? "🧮 Duelo matemático" : info.musical ? "🎵 Duelo musical" : "Duelo"} · Arena de la liga ${info.league}`;
      const sides = root.querySelector(".join-sides");
      sides.textContent = "";
      const button = document.createElement("button");
      button.className = "menu-choice";
      button.dataset.joinSide = info.free[0];
      const name = document.createElement("span");
      name.className = "menu-choice-name";
      name.textContent = "Unirse al duelo";
      const desc = document.createElement("span");
      desc.className = "menu-choice-desc";
      desc.textContent = info.math
        ? "Tu ejército contra el suyo, a base de operaciones"
        : info.musical
          ? "Tu ejército contra el suyo, al ritmo de la canción"
          : "Tu ejército contra el suyo";
      button.append(name, desc);
      sides.append(button);
      return;
    }
    const money = MONEY_NAMES[info.money] || MONEY_NAMES.normal;
    const yours = info.free.length === 1 ? ` · Te toca ${info.free[0] === "attack" ? "atacar" : "defender"}` : "";
    root.querySelector(".join-info").textContent = `Mapa ${info.level}${yours} · Dinero de la defensa: ${money}`;
    const sides = root.querySelector(".join-sides");
    sides.textContent = "";
    for (const side of info.free) {
      const button = document.createElement("button");
      button.className = "menu-choice";
      button.dataset.joinSide = side;
      const name = document.createElement("span");
      name.className = "menu-choice-name";
      name.textContent = side === "attack" ? "Atacar" : "Defender";
      const desc = document.createElement("span");
      desc.className = "menu-choice-desc";
      desc.textContent = side === "attack" ? "Tu ejército contra sus torres" : "Tus torres contra su ejército";
      button.append(name, desc);
      sides.append(button);
    }
  }

  async function chooseLevel(level, options) {
    if (handlers.networked) {
      if (!(await confirm("Esto empezará una partida nueva para todos los jugadores. ¿Seguir?"))) return;
    } else if (handlers.hasGame() || autosaveExists) {
      if (!(await confirm("La partida nueva sustituirá a la de «Continuar». ¿Empezar?"))) return;
    }
    handlers.onNewGame(level, options);
  }

  async function chooseLoad(slot) {
    if (handlers.networked) {
      if (!(await confirm("Esto cambiará la partida para todos los jugadores. ¿Cargar?"))) return;
    } else if (context === "pause") {
      if (!(await confirm("Se perderá lo jugado desde el último guardado. ¿Cargar esta partida?"))) return;
    }
    handlers.onLoad(slot);
  }

  async function chooseSave(entry) {
    if (entry.status !== "empty") {
      if (!(await confirm(`Ya hay una partida en el ${SLOT_NAMES[entry.slot].toLowerCase()}. ¿Sobrescribirla?`))) return;
    }
    handlers.onSave(entry.slot);
    back();
  }

  async function quitToMain() {
    if (!handlers.networked) {
      const kept = handlers.attacking() ? "hasta el comienzo de la última ronda" : "hasta la última oleada terminada";
      if (!(await confirm(`Lo jugado se conserva ${kept}. ¿Salir al menú principal?`))) return;
    }
    handlers.onQuitToMain();
  }

  function doAction(name) {
    if (name === "continue" || name === "continue-lan") handlers.onContinue();
    else if (name === "records") handlers.onRecords();
    else if (name === "resume") {
      close();
      handlers.onResume();
    } else if (name === "quit") quitToMain();
  }

  root.addEventListener("click", (evt) => {
    const target = evt.target;
    if (target.closest(".menu-confirm-yes")) return settleConfirm(true);
    if (target.closest(".menu-confirm-no")) return settleConfirm(false);
    const go = target.closest("[data-go]");
    if (go) return show(go.dataset.go);
    const act = target.closest("[data-do]");
    if (act) return doAction(act.dataset.do);
    const modeBtn = target.closest("[data-mode]");
    if (modeBtn) {
      chosenMode = modeBtn.dataset.mode;
      if (chosenMode === "rts") {
        return show("rts-mode");
      }
      // The musical duel, on trial: one league. At home, first against
      // whom; solo, it is against the computer.
      // (The Duelo Matemático is the same duel, with questions for keys.)
      if (chosenMode === "duelMusic" || chosenMode === "duelMath") {
        duelVersus = false;
        duelMusical = true;
        duelMath = chosenMode === "duelMath";
        return handlers.networked ? show("duel-rival") : chooseMusicalDuel();
      }
      if (chosenMode === "duel") {
        // At home, first against whom; solo, it is against the computer.
        duelVersus = false;
        duelMusical = false;
        duelMath = false;
        return show(handlers.networked ? "duel-rival" : "duel");
      }
      return show("levels");
    }
    const duelRivalBtn = target.closest("[data-duel-rival]");
    if (duelRivalBtn) {
      duelVersus = duelRivalBtn.dataset.duelRival === "player";
      if (duelMusical) return chooseMusicalDuel(); // (it has no profile's screen yet)
      return show("duel");
    }
    const rtsSubmodeBtn = target.closest("[data-rts-submode]");
    if (rtsSubmodeBtn) {
      const submode = rtsSubmodeBtn.dataset.rtsSubmode;
      return chooseLevel(3, { mode: "rts", submode });
    }
    const levelBtn = target.closest(".start-level-btn");
    if (levelBtn) {
      const level = Number(levelBtn.dataset.level);
      if (chosenMode !== "attack" && chosenMode !== "versus") return chooseLevel(level);
      chosenLevel = level;
      return show(chosenMode === "attack" ? "difficulty" : "side");
    }
    const difficultyBtn = target.closest("[data-difficulty]");
    if (difficultyBtn) return chooseLevel(chosenLevel, { mode: "attack", difficulty: difficultyBtn.dataset.difficulty });
    const sideBtn = target.closest("[data-side]");
    if (sideBtn) {
      chosenSide = sideBtn.dataset.side;
      return show("money");
    }
    const moneyBtn = target.closest("[data-money]");
    if (moneyBtn) return chooseLevel(chosenLevel, { mode: "versus", side: chosenSide, money: moneyBtn.dataset.money });
    const joinBtn = target.closest("[data-join-side]");
    if (joinBtn) return handlers.onJoin(joinBtn.dataset.joinSide);
    if (target.closest(".menu-back")) back();
  });

  // The sound switches and the controls' choice, all reported together.
  for (const field of root.querySelectorAll("input[data-setting], select[data-setting-choice]")) {
    field.addEventListener("change", () => {
      const settings = {};
      for (const b of root.querySelectorAll("input[data-setting]")) settings[b.dataset.setting] = b.checked;
      for (const pick of root.querySelectorAll("select[data-setting-choice]")) settings[pick.dataset.settingChoice] = pick.value;
      handlers.onSettingsChange(settings);
    });
  }

  return {
    openMain: () => open("main", "home"),
    openPause: () => open("pause", "pause"),
    // After a finished game: straight to choosing how to play the next one.
    openNewGame: () => {
      open("main", "home");
      show("mode");
    },
    // One against the other, for a tab without a side: join or watch
    // (renderSeat). Called again as the sides change, it just refreshes.
    openSeat(info) {
      if (context !== "main") open("main", "home");
      history = [];
      renderSeat(info);
    },
    isSeatScreen: () => context !== null && (current === "join" || current === "full"),
    close,
    back,
    isOpen: () => context !== null,
  };
}
