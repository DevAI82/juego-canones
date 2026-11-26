// The Duelo Matemático's track (duelQuiz.js): the musical duel's highway,
// with a question coming slowly down its middle instead of keys in seven
// lanes, and at its foot, where the keys had their dock, four boxes with
// the answers to choose from -- pressed with a finger, the mouse, or the
// keys 1 to 4. Everything round it (the armies, the bars, the volleys, the
// cheers) is the musical duel's, drawn by duelRhythmDraw.js as it is.
//
// No page here: duelScreen.js hands it the context and what to draw.
import { ARENA } from "./duelArenas.js";
import { MARK, QUIZ_STREAK_FROM, songClock, questionOf } from "./duelRhythm.js";
import { QUIZ_LANES, QUIZ_BREAK, QUIZ_LEVELS } from "./duelQuiz.js";
import { TRACK, drawHighway, drawRhythmFeedback, shout } from "./duelRhythmDraw.js";

const MID = ARENA.width / 2;

// ------------------------------------------------------------ where things are

// The four answers' boxes, left to right.
const BOX = { w: 146, h: 98, gap: 8, y: 598 };
const DOCK_W = QUIZ_LANES.length * BOX.w + (QUIZ_LANES.length - 1) * BOX.gap;
export function quizBox(index) {
  return { x: MID - DOCK_W / 2 + index * (BOX.w + BOX.gap), y: BOX.y, w: BOX.w, h: BOX.h };
}

// The answer under a point of the screen (its key), or null.
export function quizLaneAt(pos) {
  for (let i = 0; i < QUIZ_LANES.length; i++) {
    const box = quizBox(i);
    if (pos.x >= box.x && pos.x <= box.x + box.w && pos.y >= box.y && pos.y <= box.y + box.h) return QUIZ_LANES[i];
  }
  return null;
}

// Where a question's card is on its way down: from under the horizon when
// it is asked to just over the answers when its time is up.
export const QUIZ_CARD = { top: TRACK.top + 70, bottom: BOX.y - 70, w: 330, h: 118 };
// { y (its middle), scale, left (the share of its time it has left) }
export function quizCardAt(asked, now) {
  const gone = Math.max(0, Math.min(1, (now - asked.open) / (asked.t - asked.open)));
  return { y: QUIZ_CARD.top + gone * (QUIZ_CARD.bottom - QUIZ_CARD.top), scale: 0.62 + 0.38 * gone, left: 1 - gone };
}

// What a side's track shows at `now`: null before its first question;
// { asked, question, state: "answering" } while one is to be answered;
// { asked, question, state: "hit" | "missed", at } once it has been --
// at: when -- until the next one comes.
export function quizShown(m, side, now) {
  const asks = m.asks ? m.asks[side] || [] : [];
  const marks = m.marks[side] || [];
  const waiting = asks.findIndex((_, i) => (marks[i] ?? MARK.WAITING) === MARK.WAITING);
  const current = waiting >= 0 ? asks[waiting] : null;
  if (current && now >= current.open) return { asked: current, question: questionOf(m, current), state: "answering" };
  const last = (waiting >= 0 ? waiting : asks.length) - 1;
  if (last < 0) return null;
  const asked = asks[last];
  // (The next question is asked a moment after this one was settled; with
  // none asked yet, it was settled just now.)
  const at = current ? current.open - QUIZ_BREAK : Math.min(now, asked.t);
  return { asked, question: questionOf(m, asked), state: marks[last] === MARK.HIT ? "hit" : "missed", at };
}

// ------------------------------------------------------------ the drawing

const BOX_COLOR = { 1: "#ffd24c", 2: "#ff9233", 3: "#c678ff", 4: "#38d8ff" };
const SIGN_COLOR = { "×": "#7dd3fc", "+": "#9effb0", "−": "#ffcf7a" };

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The question's card: its sum, big; under it, the time it has left.
function drawCard(ctx, shown, now) {
  const { asked, question, state } = shown;
  const place = quizCardAt(asked, state === "answering" ? now : shown.at);
  const s = place.scale;
  const w = QUIZ_CARD.w * s;
  const h = QUIZ_CARD.h * s;
  const x = MID - w / 2;
  const y = place.y - h / 2;
  const sign = question.text.split(" ")[1];
  const edge = state === "hit" ? "#3dff7a" : state === "missed" ? "#ff4338" : SIGN_COLOR[sign] || "#7dd3fc";

  ctx.save();
  ctx.shadowColor = edge;
  ctx.shadowBlur = state === "answering" ? 16 : 30;
  rounded(ctx, x, y, w, h, 16 * s);
  const glass = ctx.createLinearGradient(0, y, 0, y + h);
  if (state === "hit") {
    glass.addColorStop(0, "rgba(16, 70, 36, 0.96)");
    glass.addColorStop(1, "rgba(8, 40, 22, 0.96)");
  } else if (state === "missed") {
    glass.addColorStop(0, "rgba(86, 18, 16, 0.96)");
    glass.addColorStop(1, "rgba(48, 10, 10, 0.96)");
  } else {
    glass.addColorStop(0, "rgba(24, 34, 52, 0.96)");
    glass.addColorStop(1, "rgba(8, 14, 24, 0.96)");
  }
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 4 * s;
  ctx.strokeStyle = edge;
  ctx.stroke();
  ctx.restore();

  if (state === "answering") {
    shout(ctx, question.text, MID, place.y - 8 * s, { size: Math.round(68 * s), color: "#ffffff" });
    // Its time, running out: a bar that empties, red at the end.
    const barW = (QUIZ_CARD.w - 56) * s;
    const barX = MID - barW / 2;
    const barY = y + h - 20 * s;
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
    ctx.fillRect(barX, barY, barW, 8 * s);
    ctx.fillStyle = place.left < 0.25 ? "#ff4338" : place.left < 0.5 ? "#ffcf4a" : "#3dff7a";
    ctx.fillRect(barX, barY, barW * place.left, 8 * s);
    ctx.restore();
    // How hard it is: a pip a level.
    ctx.save();
    for (let i = 0; i < QUIZ_LEVELS; i++) {
      ctx.fillStyle = i <= asked.level ? "#ffe27a" : "rgba(255, 255, 255, 0.2)";
      ctx.fillRect(x + (16 + i * 11) * s, y + 10 * s, 8 * s, 5 * s);
    }
    ctx.restore();
  } else {
    // What it came to, right or wrong: the sum with its answer.
    const mark = state === "hit" ? "✓" : "✗";
    shout(ctx, `${question.text} = ${question.answer}`, MID, place.y - 4 * s, { size: Math.round(54 * s), color: state === "hit" ? "#b9ffcf" : "#ffd3cf" });
    // (On the card's corner, clear of the sum.)
    shout(ctx, mark, x + w - 4 * s, y + 4 * s, { size: Math.round(40 * s), color: edge });
  }
}

// The four answers. presses: { [lane]: { age, hit } }, the ones just made.
function drawAnswers(ctx, shown, presses) {
  const live = shown && shown.state === "answering";
  QUIZ_LANES.forEach((lane, i) => {
    const box = quizBox(i);
    const press = presses[lane];
    const pressed = press && press.age < 0.3 ? 1 - press.age / 0.3 : 0;
    const right = shown && shown.state !== "answering" && shown.question.lane === lane;
    const color = BOX_COLOR[lane];

    ctx.save();
    ctx.globalAlpha = live || right ? 1 : shown ? 0.42 : 0.3;
    if (live || right) {
      ctx.shadowColor = right ? "#3dff7a" : color;
      ctx.shadowBlur = right ? 26 : 12 + pressed * 18;
    }
    rounded(ctx, box.x, box.y, box.w, box.h, 16);
    const fill = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
    fill.addColorStop(0, right ? "#1c6b3a" : "#2a3448");
    fill.addColorStop(1, right ? "#0f3d22" : "#101826");
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (pressed > 0) {
      ctx.fillStyle = press.hit ? `rgba(61, 255, 122, ${0.55 * pressed})` : `rgba(255, 67, 56, ${0.6 * pressed})`;
      ctx.fill();
    }
    ctx.lineWidth = 4;
    ctx.strokeStyle = right ? "#3dff7a" : color;
    ctx.stroke();

    // Its key, small, in a corner (the keyboard's 1 to 4).
    ctx.font = "900 16px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = color;
    ctx.fillText(lane, box.x + 10, box.y + 8);
    ctx.restore();

    if (shown) {
      const value = String(shown.question.options[i]);
      shout(ctx, value, box.x + box.w / 2, box.y + box.h / 2 + 4, {
        size: value.length > 2 ? 46 : 56,
        color: right ? "#d6ffe2" : "#ffffff",
        alpha: live || right ? 1 : 0.4,
      });
    }
  });
}

// What to do, before the first question.
function drawReady(ctx) {
  ctx.save();
  ctx.fillStyle = "rgba(8, 14, 24, 0.82)";
  ctx.strokeStyle = "rgba(96, 210, 255, 0.55)";
  ctx.lineWidth = 1.6;
  rounded(ctx, MID - 250, TRACK.top + 105, 500, 226, 14);
  ctx.fill();
  ctx.stroke();
  shout(ctx, "¡PREPÁRATE!", MID, TRACK.top + 150, { size: 40, color: "#ffe27a", glow: "#ff9900" });
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
  ctx.shadowBlur = 8;
  ctx.font = "bold 17px sans-serif";
  ctx.fillStyle = "#e2f1ff";
  ctx.fillText("Van a bajar operaciones por el carril: calcula el resultado", MID, TRACK.top + 198);
  ctx.fillText("Tócalo abajo, o pulsa su tecla (1 2 3 4), antes de que llegue", MID, TRACK.top + 226);
  ctx.fillStyle = "#ffb4a8";
  ctx.fillText("Si fallas, dispara el rival", MID, TRACK.top + 260);
  ctx.fillStyle = "#9effb0";
  ctx.fillText("Con 3 aciertos seguidos, ¡dispara tu ejército en cada acierto!", MID, TRACK.top + 292);
  ctx.restore();
}

// What a streak is worth, said over the track: how many right answers are
// still to go before one's army fires; then that the next one fires it --
// or, with `loading` s to go before it can again, that it is loading.
export function quizStreakLine(streak, loading = 0) {
  if (streak >= QUIZ_STREAK_FROM) {
    return { text: `🔥 EN RACHA (${streak}): ${loading > 0.05 ? "tu ejército recarga…" : "¡acierta y dispara tu ejército!"}`, on: true };
  }
  const left = QUIZ_STREAK_FROM - Math.max(0, streak);
  return { text: `${left === 1 ? "Un acierto más" : `${left} aciertos seguidos`} y dispara tu ejército`, on: false };
}

// scene: as duelRhythmDraw.js's drawRhythm -- { view, side, presses, loading }.
export function drawQuiz(ctx, scene) {
  const { view, side } = scene;
  const m = view.musical;
  const now = songClock(view);
  drawHighway(ctx, { song: m.song, now, streak: m.tally[side].streak, lanes: false });

  const shown = quizShown(m, side, now);
  drawAnswers(ctx, shown, scene.presses || {});
  if (shown) {
    const line = quizStreakLine(m.tally[side].streak, m.loaded ? m.loaded[side] : 0);
    shout(ctx, line.text, MID, TRACK.top + 12, { size: line.on ? 20 : 16, color: line.on ? "#ffe27a" : "#cfe6ff", alpha: line.on ? 1 : 0.85, glow: line.on ? "#ff9900" : null });
    drawCard(ctx, shown, now);
  } else if (m.tally[side].hits + m.tally[side].misses === 0) drawReady(ctx);
  if (scene.loading) shout(ctx, "Cargando música…", MID, TRACK.top + 36, { size: 16, color: "#ffe27a" });

  drawRhythmFeedback(ctx, scene, { saidY: BOX.y + BOX.h + 26 });
}
