// supabase/functions/whatsapp-webhook/modules/games/trivia.ts
// Trivia Challenge — 10 questions, buttons, deterministic

import {
  GameSession,
  createGameSession,
  updateGameSession,
  getRandomQuestions,
  logGameAnswer,
  GameQuestion,
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

// ═══════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════

export async function start(
  phone: string,
  conversationId: string,
  difficulty: string
): Promise<void> {
  const questions = await getRandomQuestions("TRIVIA", difficulty, TOTAL_QUESTIONS);

  if (questions.length < 5) {
    await sendTextMessage(
      phone,
      `⚠️ Not enough *${difficulty}* questions available yet. Try another difficulty!`
    );
    await showDifficultySelector(phone, conversationId, "TRIVIA");
    return;
  }

  const session = await createGameSession(phone, "TRIVIA", difficulty, {
    questionIds: questions.map((q) => q.id),
  });

  if (!session) {
    await sendTextMessage(phone, "⚠️ Could not start game. Please try again.");
    await showGamesMenu(phone, conversationId);
    return;
  }

  await sendTextMessage(
    phone,
    `🧠 *TRIVIA CHALLENGE STARTED!*\n\n` +
    `Difficulty: *${difficulty}*\n` +
    `Questions: *${questions.length}*\n` +
    `Timer: *30 minutes*\n\n` +
    `_Answer using the buttons below each question!_`
  );

  await sendNextQuestion(phone, session, questions[0], 0);
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

  // Format: trivia_<index>_<A|B|C|D>
  if (rawInput.startsWith("TRIVIA_")) {
    const parts = rawInput.split("_");
    const qIdx = parseInt(parts[1], 10);
    const answer = parts[2];

    if (!validateAnswerOwnership(session, qIdx)) {
      await sendTextMessage(phone, "⚠️ That question has already been answered. Please continue with the current one.");
      return;
    }

    await processAnswer(phone, session, qIdx, answer, conversationId);
    return;
  }

  // Text fallback (single letter answer)
  const letter = text.trim().toUpperCase().charAt(0);
  if (["A", "B", "C", "D"].includes(letter)) {
    await processAnswer(phone, session, session.current_question, letter, conversationId);
    return;
  }

  await sendTextMessage(phone, "⚠️ Please tap one of the answer buttons (A / B / C / D).");
}

// ═══════════════════════════════════════════════════════
// PROCESS ANSWER
// ═══════════════════════════════════════════════════════

async function processAnswer(
  phone: string,
  session: GameSession,
  qIdx: number,
  answer: string,
  conversationId: string
): Promise<void> {
  const meta = session.metadata as { questionIds?: string[] };
  const ids = meta.questionIds || [];
  if (qIdx >= ids.length) {
    await handleGameEnd(phone, session, conversationId);
    return;
  }

  // Fetch the current question
  const questions = await getRandomQuestions("TRIVIA", session.difficulty, 1000);
  const currentQ = questions.find((q) => q.id === ids[qIdx]);

  if (!currentQ) {
    await sendTextMessage(phone, "⚠️ Question not found. Ending game.");
    await handleGameEnd(phone, session, conversationId);
    return;
  }

  const correctLetter = currentQ.correct_answer.trim().toUpperCase();
  const isCorrect = answer === correctLetter;
  const points = calculatePoints(session.difficulty, session.streak, isCorrect);

  await logGameAnswer(session.id, currentQ.id, qIdx, answer, correctLetter, isCorrect, points);
  const updated = await applyAnswerToSession(session, isCorrect, points, true);

  if (!updated) {
    await handleGameEnd(phone, session, conversationId);
    return;
  }

  // Feedback
  let feedback = isCorrect
    ? `✅ *Correct!* +${points} pts${updated.streak >= 3 ? ` 🔥 (${updated.streak} streak!)` : ""}`
    : `❌ *Wrong.* Correct answer was *${correctLetter}*.`;

  if (currentQ.explanation) {
    feedback += `\n\n💡 _${currentQ.explanation}_`;
  }

  feedback += `\n\n📊 *Score:* ${updated.score} pts | *Streak:* ${updated.streak}`;

  await sendTextMessage(phone, feedback);

  // Next Question or End
  if (updated.current_question >= ids.length) {
    await handleGameEnd(phone, updated, conversationId);
    return;
  }

  const nextQ = questions.find((q) => q.id === ids[updated.current_question]);
  if (nextQ) {
    await sendNextQuestion(phone, updated, nextQ, updated.current_question);
  } else {
    await handleGameEnd(phone, updated, conversationId);
  }
}

// ═══════════════════════════════════════════════════════
// SEND NEXT QUESTION
// ═══════════════════════════════════════════════════════

async function sendNextQuestion(
  phone: string,
  session: GameSession,
  question: GameQuestion,
  qIdx: number
): Promise<void> {
  const body =
    `🧠 *QUESTION ${qIdx + 1}/${TOTAL_QUESTIONS}*\n` +
    `_Category: ${question.category} • ${session.difficulty}_\n\n` +
    `${question.question}\n\n` +
    `*A.* ${question.option_a}\n` +
    `*B.* ${question.option_b}\n` +
    `*C.* ${question.option_c}\n` +
    `*D.* ${question.option_d}`;

  // WhatsApp only supports 3 buttons per message, so we split A/B/C in buttons + D as fallback text
  await sendButtonMessage(
    phone,
    body,
    [
      makeButton(`trivia_${qIdx}_A`, "A"),
      makeButton(`trivia_${qIdx}_B`, "B"),
      makeButton(`trivia_${qIdx}_C`, "C"),
    ],
    `Q ${qIdx + 1}/${TOTAL_QUESTIONS}`
  );

  // Send option D as a separate button
  await sendButtonMessage(
    phone,
    `_Or select option D:_`,
    [makeButton(`trivia_${qIdx}_D`, "D")],
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
    `🏆 *TRIVIA COMPLETE!*\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📊 *Final Score:* ${session.score}/${maxPossible}\n` +
    `✅ *Correct:* ${session.correct_answers}\n` +
    `❌ *Wrong:* ${session.wrong_answers}\n` +
    `🔥 *Best Streak:* ${session.max_streak}\n` +
    `⭐ *XP Earned:* +${xp}\n` +
    `━━━━━━━━━━━━━━━━\n\n`;

  if (percentage >= 80) msg += `🎉 *Outstanding performance!*`;
  else if (percentage >= 60) msg += `👍 *Well done!*`;
  else msg += `📚 *Keep practicing!*`;

  if (achievements.length > 0) {
    msg += `\n\n🏅 *Achievements Unlocked:*\n${achievements.map((a) => `  • ${a}`).join("\n")}`;
  }

  await sendButtonMessage(
    phone,
    msg,
    [
      makeButton(`diff_${session.difficulty === "HARD" ? "hard" : session.difficulty === "MEDIUM" ? "med" : "easy"}_TRIVIA`, "🔁 Play Again"),
      makeButton("game_menu", "🎮 Other Games"),
      makeButton("menu_home", "🏠 Main Menu"),
    ],
    "Game Complete"
  );
}
