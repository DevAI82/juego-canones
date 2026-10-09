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
//     (options: { mode: "attack", difficulty } for an attack)
//   onRecords(), onQuitToMain(), onResume(), onSettingsChange(settings)

const SLOT_NAMES = { auto: "Autoguardado", 1: "Hueco 1", 2: "Hueco 2", 3: "Hueco 3" };
const pad = (n) => String(n).padStart(2, "0");

export const DIFFICULTY_NAMES = { easy: "Fácil", normal: "Normal", hard: "Difícil" };

// "Defensa · Nivel 4 · Oleada 12 · ❤ 15 · $320 · 08/10 18:30" or "Ataque ·
// Nivel 3 · Ronda 5 · Difícil · ❤ 12 · $240 · ...": a save as the menu
// lists it, the date in this device's own time. A summary without a mode
// is a defence game's.
export function describeSave(summary) {
  const when = summary.savedAt ? new Date(summary.savedAt) : null;
  const date =
    when && !Number.isNaN(when.getTime())
      ? ` · ${pad(when.getDate())}/${pad(when.getMonth() + 1)} ${pad(when.getHours())}:${pad(when.getMinutes())}`
      : "";
  if (summary.mode === "attack") {
    const difficulty = DIFFICULTY_NAMES[summary.difficulty] || DIFFICULTY_NAMES.normal;
    return `Ataque · Nivel ${summary.level} · Ronda ${summary.round} · ${difficulty} · ❤ ${summary.lives} · $${summary.money}${date}`;
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

  function open(ctx, screen) {
    context = ctx;
    history = [];
    current = null;
    root.classList.remove("hidden");
    root.classList.toggle("main", ctx === "main");
    titleEl.textContent = ctx === "main" ? "TOWER DEFENSE" : "MENÚ";
    document.body.classList.add("menu-open");
    show(screen, false);
  }

  function close() {
    context = null;
    root.classList.add("hidden");
    document.body.classList.remove("menu-open");
    settleConfirm(false);
  }

  function show(name, remember = true) {
    if (remember && current) history.push(current);
    current = name;
    for (const el of screens) el.classList.toggle("hidden", el.dataset.screen !== name);
    if (name === "home") renderHome();
    else if (name === "load" || name === "save") renderSlots(name);
    else if (name === "settings") renderSettings();
    else if (name === "multiplayer") renderMultiplayer();
    else if (name === "mode") renderMode();
    else if (name === "levels") renderLevels();
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
    if (handlers.networked) {
      cont.textContent = "Volver a la partida";
      cont.classList.remove("hidden");
      return;
    }
    cont.textContent = "Continuar";
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
  }

  function renderMultiplayer() {
    root.querySelector(".lan-info").textContent = handlers.networked
      ? `Ya estáis jugando en red. Los demás dispositivos de casa pueden unirse abriendo ${location.origin}`
      : "Para jugar en red en casa, el juego tiene que abrirse desde el ordenador que hace de servidor.";
    root.querySelector('[data-do="continue-lan"]').classList.toggle("hidden", !handlers.networked);
  }

  // The attack mode is solo only for now (design §7).
  function renderMode() {
    const attack = root.querySelector('[data-mode="attack"]');
    attack.disabled = Boolean(handlers.networked);
    attack.querySelector(".menu-choice-desc").textContent = handlers.networked
      ? "Solo en partida individual, por ahora"
      : "Forma un ejército y rompe la base";
  }

  function renderLevels() {
    root.querySelector('[data-screen="levels"] .menu-subtitle').textContent =
      chosenMode === "attack" ? "Elige el mapa que atacarás" : "Elige nivel";
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
      return show("levels");
    }
    const levelBtn = target.closest(".start-level-btn");
    if (levelBtn) {
      const level = Number(levelBtn.dataset.level);
      if (chosenMode !== "attack") return chooseLevel(level);
      chosenLevel = level;
      return show("difficulty");
    }
    const difficultyBtn = target.closest("[data-difficulty]");
    if (difficultyBtn) return chooseLevel(chosenLevel, { mode: "attack", difficulty: difficultyBtn.dataset.difficulty });
    if (target.closest(".menu-back")) back();
  });

  for (const box of root.querySelectorAll("input[data-setting]")) {
    box.addEventListener("change", () => {
      const settings = {};
      for (const b of root.querySelectorAll("input[data-setting]")) settings[b.dataset.setting] = b.checked;
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
    close,
    back,
    isOpen: () => context !== null,
  };
}
