// supabase/functions/whatsapp-webhook/modules/games/riddles.ts
// Riddle Master — Text-input riddles with hints

import {
  GameSession,
  createGameSession,
  updateGameSession,
  getRandomQuestions,
  logGameAnswer,
} from "../../database.ts";
import {
  sendButtonMessage,
  sendTextMessage,
  makeButton,
} from "../../whatsapp.ts";
import { normalise, safeErrorLog } from "../../utils.ts";
import {
  calculatePoints,
  applyAnswerToSession,
  finalizeGame,
} from "./engine.ts";
import { showGamesMenu, showDifficultySelector } from "./index.ts";

const TOTAL_RIDDLES = 5;
const MAX_ATTEMPTS_PER_RIDDLE = 3;

// ═══════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════

export async function start(
  phone: string,
  conversationId: string,
  difficulty: string
): Promise<void> {
  const riddles = await getRandomQuestions("RIDDLE", difficulty, TOTAL_RIDDLES);

  if (riddles.length < 3) {
    await sendTextMessage(
      phone,
      `⚠️ Not enough *${difficulty}* riddles available yet. Try another difficulty!`
    );
    await showDifficultySelector(phone, conversationId, "RIDDLE");
    return;
  }

  const session = await createGameSession(phone, "RIDDLE", difficulty, {
    riddleIds: riddles.map((r) => r.id),
    attemptsOnCurrent: 0,
    hintUsed: false,
  });

  if (!session) {
    await sendTextMessage(phone, "⚠️ Could not start Riddle Master. Please try again.");
    await showGamesMenu(phone, conversationId);
    return;
  }

  await sendTextMessage(
    phone,
    `🧩 *RIDDLE MASTER STARTED!*\n\n` +
    `Difficulty: *${difficulty}*\n` +
    `Riddles: *${riddles.length}*\n` +
    `Attempts per riddle: *${MAX_ATTEMPTS_PER_RIDDLE}*\n\n` +
    `_Type your answer or tap 💡 for a hint._`
  );

  await sendRiddle(phone, session, riddles[0], 0);
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
  const rawInput = (interactiveId || text || "").trim();
  const meta = session.metadata as {
    riddleIds?: string[];
    attemptsOnCurrent?: number;
    hintUsed?: boolean;
  };
  const ids = meta.riddleIds || [];
  const qIdx = session.current_question;

  if (qIdx >= ids.length) {
    await handleGameEnd(phone, session, conversationId);
    return;
  }

  // Fetch current riddle
  const bank = await getRandomQuestions("RIDDLE", session.difficulty, 500);
  const riddle = bank.find((r) => r.id === ids[qIdx]);
  if (!riddle) {
    await handleGameEnd(phone, session, conversationId);
    return;
  }

  // HINT button
  if (rawInput === "riddle_hint") {
    if (meta.hintUsed) {
      await sendTextMessage(phone, "💡 You've already used your hint for this riddle!");
      return;
    }
    const hintText = riddle.explanation
      ? `💡 *Hint:* Think about — the first letter is *${riddle.correct_answer.charAt(0)}* and it has *${riddle.correct_answer.replace(/\s/g, "").length}* letters.`
      : `💡 *Hint:* The first letter is *${riddle.correct_answer.charAt(0)}*.`;

    await sendTextMessage(phone, hintText);
    await updateGameSession(session.id, {
      metadata: { ...meta, hintUsed: true },
    } as any);
    return;
  }

  // SKIP button
  if (rawInput === "riddle_skip") {
    await sendTextMessage(phone, `⏭️ *Skipped.* The answer was *${riddle.correct_answer}*.`);
    await advanceToNext(phone, session, conversationId, false, 0);
    return;
  }

  // Answer submission
  const userAnswer = normalise(rawInput);
  const correctAnswer = normalise(riddle.correct_answer);
  const acceptable = [correctAnswer, ...correctAnswer.split(" ")];

  const isCorrect = acceptable.some((a) => a === userAnswer || a.includes(userAnswer) || userAnswer.includes(a));
  const attempts = (meta.attemptsOnCurrent || 0) + 1;

  if (isCorrect) {
    let points = calculatePoints(session.difficulty, session.streak, true);
    if (meta.hintUsed) points = Math.round(points / 2); // Half points if hint used
    if (attempts > 1) points = Math.max(5, points - (attempts - 1) * 3);

    await logGameAnswer(session.id, riddle.id, qIdx, rawInput, riddle.correct_answer, true, points);
    await sendTextMessage(
      phone,
      `✅ *Correct!*\nThe answer is *${riddle.correct_answer}*.\n\n` +
      `💡 _${riddle.explanation || ""}_\n\n` +
      `+${points} points${meta.hintUsed ? " (½ for hint)" : ""}!`
    );
    await advanceToNext(phone, session, conversationId, true, points);
    return;
  }

  // Wrong answer
  if (attempts >= MAX_ATTEMPTS_PER_RIDDLE) {
    await logGameAnswer(session.id, riddle.id, qIdx, rawInput, riddle.correct_answer, false, 0);
    await sendTextMessage(
      phone,
      `❌ *Out of attempts!*\n\nThe answer was *${riddle.correct_answer}*.\n\n💡 _${riddle.explanation || ""}_`
    );
    await advanceToNext(phone, session, conversationId, false, 0);
    return;
  }

  const attemptsLeft = MAX_ATTEMPTS_PER_RIDDLE - attempts;
  await updateGameSession(session.id, {
    metadata: { ...meta, attemptsOnCurrent: attempts },
  } as any);

  await sendButtonMessage(
    phone,
    `❌ *Not quite!* You have *${attemptsLeft}* attempt${attemptsLeft === 1 ? "" : "s"} left.\n\nTry again or use a hint:`,
    [
      makeButton("riddle_hint", "💡 Hint"),
      makeButton("riddle_skip", "⏭️ Skip"),
    ],
    "Keep trying!"
  );
}

// ═══════════════════════════════════════════════════════
// ADVANCE TO NEXT RIDDLE
// ═══════════════════════════════════════════════════════

async function advanceToNext(
  phone: string,
  session: GameSession,
  conversationId: string,
  isCorrect: boolean,
  points: number
): Promise<void> {
  const updated = await applyAnswerToSession(session, isCorrect, points, true);
  if (!updated) return;

  // Reset per-riddle state
  await updateGameSession(updated.id, {
    metadata: { ...updated.metadata, attemptsOnCurrent: 0, hintUsed: false },
  } as any);

  const meta = updated.metadata as { riddleIds?: string[] };
  const ids = meta.riddleIds || [];

  if (updated.current_question >= ids.length) {
    await handleGameEnd(phone, updated, conversationId);
    return;
  }

  const bank = await getRandomQuestions("RIDDLE", session.difficulty, 500);
  const nextRiddle = bank.find((r) => r.id === ids[updated.current_question]);
  if (!nextRiddle) {
    await handleGameEnd(phone, updated, conversationId);
    return;
  }

  await sendRiddle(phone, updated, nextRiddle, updated.current_question);
}

// ═══════════════════════════════════════════════════════
// SEND RIDDLE
// ═══════════════════════════════════════════════════════

async function sendRiddle(
  phone: string,
  session: GameSession,
  riddle: any,
  qIdx: number
): Promise<void> {
  await sendButtonMessage(
    phone,
    `🧩 *RIDDLE ${qIdx + 1}/${TOTAL_RIDDLES}*\n` +
    `_Category: ${riddle.category} • ${session.difficulty}_\n\n` +
    `${riddle.question}\n\n` +
    `_Type your answer below:_`,
    [
      makeButton("riddle_hint", "💡 Hint"),
      makeButton("riddle_skip", "⏭️ Skip"),
    ],
    `Riddle ${qIdx + 1}/${TOTAL_RIDDLES}`
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

  let msg =
    `🏆 *RIDDLE MASTER COMPLETE!*\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📊 *Final Score:* ${session.score} pts\n` +
    `✅ *Solved:* ${session.correct_answers}\n` +
    `❌ *Missed:* ${session.wrong_answers}\n` +
    `🔥 *Best Streak:* ${session.max_streak}\n` +
    `⭐ *XP Earned:* +${xp}\n` +
    `━━━━━━━━━━━━━━━━\n\n`;

  if (percentage >= 80) msg += `🧠 *Riddle Master Extraordinaire!*`;
  else if (percentage >= 60) msg += `👏 *Sharp thinker!*`;
  else msg += `📚 *Keep exercising that brain!*`;

  if (achievements.length > 0) {
    msg += `\n\n🏅 *Achievements:*\n${achievements.map((a) => `  • ${a}`).join("\n")}`;
  }

  await sendButtonMessage(
    phone,
    msg,
    [
      makeButton(`diff_${session.difficulty === "HARD" ? "hard" : session.difficulty === "MEDIUM" ? "med" : "easy"}_RIDDLE`, "🔁 Play Again"),
      makeButton("game_menu", "🎮 Other Games"),
      makeButton("menu_home", "🏠 Main Menu"),
    ],
    "Game Complete"
  );
}
