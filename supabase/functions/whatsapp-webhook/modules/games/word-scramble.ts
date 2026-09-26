// supabase/functions/whatsapp-webhook/modules/games/word-scramble.ts
// Word Scramble — Unscramble the word

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

const TOTAL_WORDS = 5;
const MAX_ATTEMPTS_PER_WORD = 3;

// ═══════════════════════════════════════════════════════
// SCRAMBLER
// ═══════════════════════════════════════════════════════

function scrambleWord(word: string): string {
  const clean = word.replace(/\s/g, "").toUpperCase();
  const arr = clean.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  // Ensure scrambled differs from original
  if (arr.join("") === clean && clean.length > 1) {
    return scrambleWord(word);
  }
  return arr.join(" ");
}

// ═══════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════

export async function start(
  phone: string,
  conversationId: string,
  difficulty: string
): Promise<void> {
  const words = await getRandomQuestions("WORD_SCRAMBLE", difficulty, TOTAL_WORDS);

  if (words.length < 3) {
    await sendTextMessage(
      phone,
      `⚠️ Not enough *${difficulty}* words available. Try another level!`
    );
    await showDifficultySelector(phone, conversationId, "WORD_SCRAMBLE");
    return;
  }

  const session = await createGameSession(phone, "WORD_SCRAMBLE", difficulty, {
    wordIds: words.map((w) => w.id),
    scrambled: words.map((w) => scrambleWord(w.correct_answer)),
    attemptsOnCurrent: 0,
    hintUsed: false,
  });

  if (!session) {
    await sendTextMessage(phone, "⚠️ Could not start Word Scramble. Please try again.");
    await showGamesMenu(phone, conversationId);
    return;
  }

  await sendTextMessage(
    phone,
    `🔤 *WORD SCRAMBLE STARTED!*\n\n` +
    `Difficulty: *${difficulty}*\n` +
    `Words: *${words.length}*\n\n` +
    `_Unscramble each word. Type your answer or tap 💡 for a hint._`
  );

  await sendWord(phone, session, words[0], 0);
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
    wordIds?: string[];
    scrambled?: string[];
    attemptsOnCurrent?: number;
    hintUsed?: boolean;
  };
  const ids = meta.wordIds || [];
  const qIdx = session.current_question;

  if (qIdx >= ids.length) {
    await handleGameEnd(phone, session, conversationId);
    return;
  }

  // Fetch current word
  const bank = await getRandomQuestions("WORD_SCRAMBLE", session.difficulty, 500);
  const wordItem = bank.find((w) => w.id === ids[qIdx]);
  if (!wordItem) {
    await handleGameEnd(phone, session, conversationId);
    return;
  }

  // HINT
  if (rawInput === "word_hint") {
    if (meta.hintUsed) {
      await sendTextMessage(phone, "💡 You've already used your hint!");
      return;
    }
    const word = wordItem.correct_answer.replace(/\s/g, "");
    const hintText =
      `💡 *Hint:*\n` +
      `• Starts with: *${word.charAt(0)}*\n` +
      `• Ends with: *${word.charAt(word.length - 1)}*\n` +
      `• Length: *${word.length}* letters\n` +
      `• Definition: _${wordItem.question}_`;

    await sendTextMessage(phone, hintText);
    await updateGameSession(session.id, {
      metadata: { ...meta, hintUsed: true },
    } as any);
    return;
  }

  // SKIP
  if (rawInput === "word_skip") {
    await sendTextMessage(phone, `⏭️ *Skipped.* The word was *${wordItem.correct_answer}*.`);
    await advanceToNext(phone, session, conversationId, false, 0);
    return;
  }

  // Submitted answer
  const userAnswer = normalise(rawInput);
  const correctAnswer = normalise(wordItem.correct_answer);
  const isCorrect = userAnswer === correctAnswer || userAnswer === correctAnswer.replace(/\s/g, "");
  const attempts = (meta.attemptsOnCurrent || 0) + 1;

  if (isCorrect) {
    let points = calculatePoints(session.difficulty, session.streak, true);
    if (meta.hintUsed) points = Math.round(points / 2);
    if (attempts > 1) points = Math.max(5, points - (attempts - 1) * 3);

    await logGameAnswer(session.id, wordItem.id, qIdx, rawInput, wordItem.correct_answer, true, points);
    await sendTextMessage(
      phone,
      `✅ *Correct!*\nThe word is *${wordItem.correct_answer}*!\n\n` +
      `💡 _${wordItem.explanation || ""}_\n\n` +
      `+${points} pts${meta.hintUsed ? " (½ for hint)" : ""}`
    );
    await advanceToNext(phone, session, conversationId, true, points);
    return;
  }

  // Wrong
  if (attempts >= MAX_ATTEMPTS_PER_WORD) {
    await logGameAnswer(session.id, wordItem.id, qIdx, rawInput, wordItem.correct_answer, false, 0);
    await sendTextMessage(
      phone,
      `❌ *Out of attempts!*\n\nThe word was *${wordItem.correct_answer}*.\n\n💡 _${wordItem.explanation || ""}_`
    );
    await advanceToNext(phone, session, conversationId, false, 0);
    return;
  }

  const attemptsLeft = MAX_ATTEMPTS_PER_WORD - attempts;
  await updateGameSession(session.id, {
    metadata: { ...meta, attemptsOnCurrent: attempts },
  } as any);

  await sendButtonMessage(
    phone,
    `❌ *Not quite!* You have *${attemptsLeft}* attempt${attemptsLeft === 1 ? "" : "s"} left.`,
    [
      makeButton("word_hint", "💡 Hint"),
      makeButton("word_skip", "⏭️ Skip"),
    ],
    "Try again!"
  );
}

// ═══════════════════════════════════════════════════════
// ADVANCE
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

  await updateGameSession(updated.id, {
    metadata: { ...updated.metadata, attemptsOnCurrent: 0, hintUsed: false },
  } as any);

  const meta = updated.metadata as { wordIds?: string[] };
  const ids = meta.wordIds || [];

  if (updated.current_question >= ids.length) {
    await handleGameEnd(phone, updated, conversationId);
    return;
  }

  const bank = await getRandomQuestions("WORD_SCRAMBLE", session.difficulty, 500);
  const nextWord = bank.find((w) => w.id === ids[updated.current_question]);
  if (!nextWord) {
    await handleGameEnd(phone, updated, conversationId);
    return;
  }

  await sendWord(phone, updated, nextWord, updated.current_question);
}

// ═══════════════════════════════════════════════════════
// SEND WORD
// ═══════════════════════════════════════════════════════

async function sendWord(
  phone: string,
  session: GameSession,
  wordItem: any,
  qIdx: number
): Promise<void> {
  const meta = session.metadata as { scrambled?: string[] };
  const scrambled = meta.scrambled?.[qIdx] || scrambleWord(wordItem.correct_answer);

  await sendButtonMessage(
    phone,
    `🔤 *WORD ${qIdx + 1}/${TOTAL_WORDS}*\n` +
    `_Category: ${wordItem.option_b || "General"} • ${session.difficulty}_\n\n` +
    `🧩 *Unscramble:*\n\n` +
    `*${scrambled}*\n\n` +
    `📖 _Clue: ${wordItem.question}_\n\n` +
    `_Type your answer below:_`,
    [
      makeButton("word_hint", "💡 Hint"),
      makeButton("word_skip", "⏭️ Skip"),
    ],
    `Word ${qIdx + 1}/${TOTAL_WORDS}`
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
    `🏆 *WORD SCRAMBLE COMPLETE!*\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📊 *Final Score:* ${session.score} pts\n` +
    `✅ *Solved:* ${session.correct_answers}\n` +
    `❌ *Missed:* ${session.wrong_answers}\n` +
    `🔥 *Best Streak:* ${session.max_streak}\n` +
    `⭐ *XP Earned:* +${xp}\n` +
    `━━━━━━━━━━━━━━━━\n\n`;

  if (percentage >= 80) msg += `🔤 *Word Wizard!*`;
  else if (percentage >= 60) msg += `📚 *Great vocabulary!*`;
  else msg += `📖 *Keep expanding your vocabulary!*`;

  if (achievements.length > 0) {
    msg += `\n\n🏅 *Achievements:*\n${achievements.map((a) => `  • ${a}`).join("\n")}`;
  }

  await sendButtonMessage(
    phone,
    msg,
    [
      makeButton(`diff_${session.difficulty === "HARD" ? "hard" : session.difficulty === "MEDIUM" ? "med" : "easy"}_WORD_SCRAMBLE`, "🔁 Play Again"),
      makeButton("game_menu", "🎮 Other Games"),
      makeButton("menu_home", "🏠 Main Menu"),
    ],
    "Game Complete"
  );
}
