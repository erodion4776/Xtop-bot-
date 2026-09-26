// supabase/functions/whatsapp-webhook/modules/games/emoji-guess.ts

import { GameSession, createGameSession, updateGameSession, getRandomQuestions, logGameAnswer, GameQuestion } from "../../database.ts";
import { sendButtonMessage, sendTextMessage, makeButton } from "../../whatsapp.ts";
import { safeErrorLog } from "../../utils.ts";
import { calculatePoints, applyAnswerToSession, finalizeGame, validateAnswerOwnership } from "./engine.ts";
import { showGamesMenu, showDifficultySelector } from "./index.ts";

const TOTAL_QUESTIONS = 5;

export async function start(phone: string, conversationId: string, difficulty: string): Promise<void> {
  const puzzles = await getRandomQuestions("EMOJI_GUESS", difficulty, TOTAL_QUESTIONS);

  if (puzzles.length < 3) {
    await sendTextMessage(phone, `⚠️ Not enough ${difficulty} Emoji Guess puzzles available. Try another level!`);
    await showDifficultySelector(phone, conversationId, "EMOJI_GUESS");
    return;
  }

  const session = await createGameSession(phone, "EMOJI_GUESS", difficulty, {
    puzzleIds: puzzles.map((p) => p.id),
  });

  if (!session) {
    await sendTextMessage(phone, "⚠️ Could not start Emoji Guess. Please try again.");
    await showGamesMenu(phone, conversationId);
    return;
  }

  await sendTextMessage(
    phone,
    `😀 *EMOJI GUESS STARTED!*\n\n` +
    `Difficulty: *${difficulty}*\n` +
    `Puzzles: *${puzzles.length}*\n\n` +
    `_Decode the emoji sequence and select the correct answer!_`
  );

  await sendNextPuzzle(phone, session, puzzles[0], 0);
}

export async function handleInput(
  phone: string,
  text: string,
  interactiveId: string,
  session: GameSession,
  conversationId: string
): Promise<void> {
  const rawInput = (interactiveId || text || "").trim().toUpperCase();

  if (rawInput.startsWith("EMOJI_")) {
    const parts = rawInput.split("_");
    const qIdx = parseInt(parts[1], 10);
    const answer = parts[2];

    if (!validateAnswerOwnership(session, qIdx)) {
      await sendTextMessage(phone, "⚠️ This question was already answered.");
      return;
    }

    await processAnswer(phone, session, qIdx, answer, conversationId);
    return;
  }

  await sendTextMessage(phone, "⚠️ Please use the buttons below to select your answer.");
}

async function processAnswer(
  phone: string,
  session: GameSession,
  qIdx: number,
  answer: string,
  conversationId: string
): Promise<void> {
  const meta = session.metadata as { puzzleIds?: string[] };
  const ids = meta.puzzleIds || [];
  if (qIdx >= ids.length) {
    await handleGameEnd(phone, session, conversationId);
    return;
  }

  const bank = await getRandomQuestions("EMOJI_GUESS", session.difficulty, 1000);
  const currentP = bank.find((p) => p.id === ids[qIdx]);

  if (!currentP) {
    await handleGameEnd(phone, session, conversationId);
    return;
  }

  const correctLetter = currentP.correct_answer.trim().toUpperCase();
  const isCorrect = answer === correctLetter;
  const points = calculatePoints(session.difficulty, session.streak, isCorrect);

  await logGameAnswer(session.id, currentP.id, qIdx, answer, correctLetter, isCorrect, points);
  const updated = await applyAnswerToSession(session, isCorrect, points, true);

  if (!updated) return;

  let feedback = isCorrect
    ? `✅ *Correct!* +${points} pts${updated.streak >= 3 ? ` 🔥 (${updated.streak} streak!)` : ""}`
    : `❌ *Wrong.* The answer was *${currentP.correct_answer}*.`;

  if (currentP.explanation) feedback += `\n\n💡 _${currentP.explanation}_`;
  feedback += `\n\n📊 Score: *${updated.score}* | Streak: *${updated.streak}*`;

  await sendTextMessage(phone, feedback);

  if (updated.current_question >= ids.length) {
    await handleGameEnd(phone, updated, conversationId);
    return;
  }

  const nextP = bank.find((p) => p.id === ids[updated.current_question]);
  if (nextP) {
    await sendNextPuzzle(phone, updated, nextP, updated.current_question);
  } else {
    await handleGameEnd(phone, updated, conversationId);
  }
}

async function sendNextPuzzle(phone: string, session: GameSession, puzzle: GameQuestion, qIdx: number): Promise<void> {
  const body =
    `😀 *PUZZLE ${qIdx + 1}/${TOTAL_QUESTIONS}*\n` +
    `_Category: ${puzzle.category} • ${session.difficulty}_\n\n` +
    `🧩 *Decipher this:*  ${puzzle.question}\n\n` +
    `*A.* ${puzzle.option_a}\n` +
    `*B.* ${puzzle.option_b}\n` +
    `*C.* ${puzzle.option_c}\n` +
    `*D.* ${puzzle.option_d}`;

  await sendButtonMessage(
    phone,
    body,
    [
      makeButton(`emoji_${qIdx}_A`, `A`),
      makeButton(`emoji_${qIdx}_B`, `B`),
      makeButton(`emoji_${qIdx}_C`, `C`),
    ],
    `Puzzle ${qIdx + 1}/${TOTAL_QUESTIONS}`
  );

  await sendButtonMessage(phone, `_Or select Option D:_`, [makeButton(`emoji_${qIdx}_D`, `D`)], "");
}

async function handleGameEnd(phone: string, session: GameSession, conversationId: string): Promise<void> {
  const total = session.correct_answers + session.wrong_answers;
  const percentage = total > 0 ? Math.round((session.correct_answers / total) * 100) : 0;
  const isWin = percentage >= 60;

  const { xp, achievements } = await finalizeGame(session, isWin);

  let msg =
    `🏆 *EMOJI GUESS COMPLETE!*\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📊 Final Score: *${session.score}*\n` +
    `✅ Correct: *${session.correct_answers}*\n` +
    `❌ Wrong: *${session.wrong_answers}*\n` +
    `⭐ XP Earned: *+${xp}*\n` +
    `━━━━━━━━━━━━━━━━\n\n`;

  if (isWin) msg += `🎉 *Amazing! You possess great deductive instincts!*`;
  else msg += `📚 *Try again to sharpen those puzzle solving skills.*`;

  if (achievements.length > 0) {
    msg += `\n\n🏅 *Achievements:*\n${achievements.map((a) => `  • ${a}`).join("\n")}`;
  }

  await sendButtonMessage(
    phone,
    msg,
    [
      makeButton(`diff_${session.difficulty.toLowerCase()}_EMOJI_GUESS`, "🔁 Play Again"),
      makeButton("game_menu", "🎮 Other Games"),
      makeButton("menu_home", "🏠 Main Menu"),
    ],
    "Game Complete"
  );
}
