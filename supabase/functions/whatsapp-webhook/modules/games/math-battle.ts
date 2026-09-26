// supabase/functions/whatsapp-webhook/modules/games/math-battle.ts
// Math Battle — Deterministically generated arithmetic, 10 rounds

import {
  GameSession,
  createGameSession,
  updateGameSession,
  logGameAnswer,
} from "../../database.ts";
import {
  sendButtonMessage,
  sendTextMessage,
  makeButton,
} from "../../whatsapp.ts";
import { safeErrorLog } from "../../utils.ts";
import {
  calculatePoints,
  applyAnswerToSession,
  finalizeGame,
  validateAnswerOwnership,
} from "./engine.ts";
import { showGamesMenu, showDifficultySelector } from "./index.ts";

const TOTAL_QUESTIONS = 10;

interface MathQuestion {
  question: string;
  answer: number;
  options: number[];
  correctIndex: number;
}

// ═══════════════════════════════════════════════════════
// QUESTION GENERATOR (Deterministic)
// ═══════════════════════════════════════════════════════

function generateMathQuestion(difficulty: string, seed: number): MathQuestion {
  const rng = seededRandom(seed);
  const pick = (max: number) => Math.floor(rng() * max);

  let a = 0, b = 0, answer = 0, question = "";

  if (difficulty === "EASY") {
    const ops = ["+", "-", "×", "÷"];
    const op = ops[pick(ops.length)];
    if (op === "+") { a = 5 + pick(50); b = 5 + pick(50); answer = a + b; }
    else if (op === "-") { a = 30 + pick(70); b = 5 + pick(a - 5); answer = a - b; }
    else if (op === "×") { a = 2 + pick(11); b = 2 + pick(11); answer = a * b; }
    else { b = 2 + pick(9); answer = 2 + pick(11); a = b * answer; }
    question = `${a} ${op} ${b} = ?`;
  } else if (difficulty === "MEDIUM") {
    const ops = ["+", "-", "×", "÷", "%"];
    const op = ops[pick(ops.length)];
    if (op === "+") { a = 100 + pick(500); b = 100 + pick(500); answer = a + b; }
    else if (op === "-") { a = 500 + pick(500); b = 50 + pick(a - 50); answer = a - b; }
    else if (op === "×") { a = 10 + pick(40); b = 5 + pick(15); answer = a * b; }
    else if (op === "÷") { b = 3 + pick(12); answer = 5 + pick(20); a = b * answer; }
    else {
      const p = [5, 10, 15, 20, 25, 30, 50][pick(7)];
      const n = 100 + pick(400);
      answer = Math.round((p * n) / 100);
      question = `${p}% of ${n} = ?`;
    }
    if (!question) question = `${a} ${op} ${b} = ?`;
  } else { // HARD
    const type = pick(4);
    if (type === 0) {
      // Multi-step: a × b + c
      a = 10 + pick(30); b = 5 + pick(15); const c = 10 + pick(100);
      answer = a * b + c;
      question = `${a} × ${b} + ${c} = ?`;
    } else if (type === 1) {
      // Percentage of large number
      const p = [12, 15, 18, 22, 27, 35, 45][pick(7)];
      const n = 500 + pick(1500);
      answer = Math.round((p * n) / 100);
      question = `${p}% of ${n} = ?`;
    } else if (type === 2) {
      // Simple algebra: solve x
      const x = 5 + pick(20); const m = 2 + pick(9); const c = 10 + pick(50);
      answer = x;
      question = `Solve: ${m}x + ${c} = ${m * x + c}\nx = ?`;
    } else {
      // Division with remainder-free result
      b = 5 + pick(20); answer = 20 + pick(80); a = b * answer;
      question = `${a} ÷ ${b} = ?`;
    }
  }

  // Generate 3 plausible wrong options
  const wrongs = new Set<number>();
  while (wrongs.size < 3) {
    const delta = 1 + pick(Math.max(Math.floor(answer * 0.3), 5));
    const sign = pick(2) === 0 ? -1 : 1;
    const wrong = answer + sign * delta;
    if (wrong !== answer && wrong > 0) wrongs.add(wrong);
  }
  const all = [answer, ...Array.from(wrongs)].sort(() => rng() - 0.5);
  const correctIndex = all.indexOf(answer);

  return { question, answer, options: all, correctIndex };
}

// Seeded PRNG for deterministic questions per session
function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ═══════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════

export async function start(
  phone: string,
  conversationId: string,
  difficulty: string
): Promise<void> {
  const baseSeed = Date.now() % 1000000;
  const session = await createGameSession(phone, "MATH_BATTLE", difficulty, {
    baseSeed,
  });

  if (!session) {
    await sendTextMessage(phone, "⚠️ Could not start Math Battle. Please try again.");
    await showGamesMenu(phone, conversationId);
    return;
  }

  await sendTextMessage(
    phone,
    `➗ *MATH BATTLE STARTED!*\n\n` +
    `Difficulty: *${difficulty}*\n` +
    `Rounds: *${TOTAL_QUESTIONS}*\n\n` +
    `_Choose the correct answer from the buttons below!_`
  );

  const q = generateMathQuestion(difficulty, baseSeed);
  await sendNextQuestion(phone, session, q, 0);
}

// ═══════════════════════════════════════════════════════
// HANDLE INPUT
// ═══════════════════════════════════════════════════════

export async function handleInput(
  phone: string,
  text: string,
  interactiveId: string,
  session: GameSession,
  conversationId: string
): Promise<void> {
  const rawInput = (interactiveId || text || "").trim().toUpperCase();

  // Format: math_<idx>_<optionIdx>
  if (rawInput.startsWith("MATH_")) {
    const parts = rawInput.split("_");
    const qIdx = parseInt(parts[1], 10);
    const optIdx = parseInt(parts[2], 10);

    if (!validateAnswerOwnership(session, qIdx)) {
      await sendTextMessage(phone, "⚠️ That question was already answered.");
      return;
    }

    await processAnswer(phone, session, qIdx, optIdx, conversationId);
    return;
  }

  // Numeric fallback
  const numeric = parseInt(text.trim(), 10);
  if (!isNaN(numeric)) {
    const meta = session.metadata as { baseSeed?: number };
    const seed = (meta.baseSeed || 12345) + session.current_question;
    const q = generateMathQuestion(session.difficulty, seed);
    const optIdx = q.options.indexOf(numeric);
    if (optIdx >= 0) {
      await processAnswer(phone, session, session.current_question, optIdx, conversationId);
      return;
    }
    await sendTextMessage(phone, `⚠️ ${numeric} is not one of the options. Please tap a button.`);
    return;
  }

  await sendTextMessage(phone, "⚠️ Please tap one of the answer buttons.");
}

// ═══════════════════════════════════════════════════════
// PROCESS ANSWER
// ═══════════════════════════════════════════════════════

async function processAnswer(
  phone: string,
  session: GameSession,
  qIdx: number,
  optIdx: number,
  conversationId: string
): Promise<void> {
  const meta = session.metadata as { baseSeed?: number };
  const seed = (meta.baseSeed || 12345) + qIdx;
  const q = generateMathQuestion(session.difficulty, seed);

  const isCorrect = optIdx === q.correctIndex;
  const points = calculatePoints(session.difficulty, session.streak, isCorrect);

  await logGameAnswer(
    session.id,
    null,
    qIdx,
    String(q.options[optIdx]),
    String(q.answer),
    isCorrect,
    points
  );

  const updated = await applyAnswerToSession(session, isCorrect, points, true);
  if (!updated) {
    await handleGameEnd(phone, session, conversationId);
    return;
  }

  let feedback = isCorrect
    ? `✅ *Correct!* ${q.answer} — +${points} pts${updated.streak >= 3 ? ` 🔥 (${updated.streak} streak!)` : ""}`
    : `❌ *Wrong.* Correct answer: *${q.answer}*`;

  feedback += `\n\n📊 *Score:* ${updated.score} | *Streak:* ${updated.streak}`;
  await sendTextMessage(phone, feedback);

  if (updated.current_question >= TOTAL_QUESTIONS) {
    await handleGameEnd(phone, updated, conversationId);
    return;
  }

  const nextSeed = (meta.baseSeed || 12345) + updated.current_question;
  const nextQ = generateMathQuestion(session.difficulty, nextSeed);
  await sendNextQuestion(phone, updated, nextQ, updated.current_question);
}

// ═══════════════════════════════════════════════════════
// SEND NEXT QUESTION
// ═══════════════════════════════════════════════════════

async function sendNextQuestion(
  phone: string,
  session: GameSession,
  q: MathQuestion,
  qIdx: number
): Promise<void> {
  const body =
    `➗ *ROUND ${qIdx + 1}/${TOTAL_QUESTIONS}*\n` +
    `_Difficulty: ${session.difficulty}_\n\n` +
    `*${q.question}*\n\n` +
    `A. ${q.options[0]}\n` +
    `B. ${q.options[1]}\n` +
    `C. ${q.options[2]}\n` +
    `D. ${q.options[3]}`;

  await sendButtonMessage(
    phone,
    body,
    [
      makeButton(`math_${qIdx}_0`, `A. ${q.options[0]}`),
      makeButton(`math_${qIdx}_1`, `B. ${q.options[1]}`),
      makeButton(`math_${qIdx}_2`, `C. ${q.options[2]}`),
    ],
    `Round ${qIdx + 1}/${TOTAL_QUESTIONS}`
  );

  await sendButtonMessage(
    phone,
    `_Or select option D:_`,
    [makeButton(`math_${qIdx}_3`, `D. ${q.options[3]}`)],
    ""
  );
}

// ═══════════════════════════════════════════════════════
// END GAME
// ═══════════════════════════════════════════════════════

async function handleGameEnd(
  phone: string,
  session: GameSession,
  conversationId: string
): Promise<void> {
  const total = session.correct_answers + session.wrong_answers;
  const percentage = total > 0 ? Math.round((session.correct_answers / total) * 100) : 0;
  const isWin = percentage >= 60;

  const { xp, achievements } = await finalizeGame(session, isWin);

  const maxPossible = TOTAL_QUESTIONS * (
    session.difficulty === "HARD" ? 30 : session.difficulty === "MEDIUM" ? 20 : 10
  );

  let msg =
    `🏆 *MATH BATTLE COMPLETE!*\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📊 *Final Score:* ${session.score}/${maxPossible}\n` +
    `✅ *Correct:* ${session.correct_answers}\n` +
    `❌ *Wrong:* ${session.wrong_answers}\n` +
    `🔥 *Best Streak:* ${session.max_streak}\n` +
    `⭐ *XP Earned:* +${xp}\n` +
    `━━━━━━━━━━━━━━━━\n\n`;

  if (percentage >= 80) msg += `🎉 *Math Genius!*`;
  else if (percentage >= 60) msg += `👍 *Solid work!*`;
  else msg += `📚 *Keep practicing your math!*`;

  if (achievements.length > 0) {
    msg += `\n\n🏅 *Achievements:*\n${achievements.map((a) => `  • ${a}`).join("\n")}`;
  }

  await sendButtonMessage(
    phone,
    msg,
    [
      makeButton(`diff_${session.difficulty === "HARD" ? "hard" : session.difficulty === "MEDIUM" ? "med" : "easy"}_MATH_BATTLE`, "🔁 Play Again"),
      makeButton("game_menu", "🎮 Other Games"),
      makeButton("menu_home", "🏠 Main Menu"),
    ],
    "Game Complete"
  );
}
