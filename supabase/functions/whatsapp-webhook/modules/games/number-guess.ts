// supabase/functions/whatsapp-webhook/modules/games/number-guess.ts
// Number Guess — Guess the secret number with hints

import {
  GameSession,
  createGameSession,
  updateGameSession,
  logGameAnswer,
} from "../../database.ts";
import {
  sendButtonMessage,
  sendListMessage,
  sendTextMessage,
  makeButton,
  makeListRow,
} from "../../whatsapp.ts";
import { safeErrorLog } from "../../utils.ts";
import {
  calculatePoints,
  applyAnswerToSession,
  finalizeGame,
} from "./engine.ts";
import { showGamesMenu } from "./index.ts";

const DIFFICULTY_CONFIG: Record<string, { max: number; attempts: number; basePoints: number }> = {
  EASY:   { max: 20,  attempts: 6, basePoints: 10 },
  MEDIUM: { max: 50,  attempts: 8, basePoints: 20 },
  HARD:   { max: 100, attempts: 10, basePoints: 30 },
};

// ═══════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════

export async function start(
  phone: string,
  conversationId: string,
  difficulty: string
): Promise<void> {
  const cfg = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.EASY;

  // Generate secret number using crypto for fairness
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const secret = 1 + (buf[0] % cfg.max);

  const session = await createGameSession(phone, "NUMBER_GUESS", difficulty, {
    secret,
    max: cfg.max,
    attemptsAllowed: cfg.attempts,
    attemptsUsed: 0,
    guesses: [],
  }, cfg.attempts);

  if (!session) {
    await sendTextMessage(phone, "⚠️ Could not start Number Guess. Please try again.");
    await showGamesMenu(phone, conversationId);
    return;
  }

  await sendTextMessage(
    phone,
    `🔢 *NUMBER GUESS STARTED!*\n\n` +
    `Difficulty: *${difficulty}*\n` +
    `Range: *1 – ${cfg.max}*\n` +
    `Max Attempts: *${cfg.attempts}*\n\n` +
    `I'm thinking of a number... 🤔\n` +
    `_Select a number below or type your guess:_`
  );

  await sendGuessOptions(phone, session, cfg.max, cfg.attempts, cfg.attempts);
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

  // Format: ng_<number>
  let guess: number | null = null;

  if (rawInput.startsWith("ng_")) {
    const parts = rawInput.split("_");
    guess = parseInt(parts[1], 10);
  } else {
    const parsed = parseInt(text.trim(), 10);
    if (!isNaN(parsed)) guess = parsed;
  }

  if (guess === null || isNaN(guess)) {
    await sendTextMessage(phone, "⚠️ Please tap a number button or type a valid number.");
    return;
  }

  const meta = session.metadata as {
    secret?: number;
    max?: number;
    attemptsAllowed?: number;
    attemptsUsed?: number;
    guesses?: number[];
  };
  const secret = meta.secret || 1;
  const max = meta.max || 20;
  const attemptsAllowed = meta.attemptsAllowed || 6;
  const attemptsUsed = (meta.attemptsUsed || 0) + 1;
  const guesses = [...(meta.guesses || []), guess];

  if (guess < 1 || guess > max) {
    await sendTextMessage(phone, `⚠️ Please guess a number between *1* and *${max}*.`);
    return;
  }

  const isCorrect = guess === secret;
  const points = isCorrect
    ? calculatePoints(session.difficulty, session.streak, true) +
      (attemptsAllowed - attemptsUsed) * 2  // Bonus for fewer attempts
    : 0;

  await logGameAnswer(session.id, null, attemptsUsed, String(guess), String(secret), isCorrect, points);

  await updateGameSession(session.id, {
    metadata: { ...meta, attemptsUsed, guesses },
  } as any);

  if (isCorrect) {
    const updated = await applyAnswerToSession(session, true, points, false);
    if (!updated) return;

    await handleGameEnd(phone, updated, conversationId, true, attemptsUsed);
    return;
  }

  // Out of attempts
  if (attemptsUsed >= attemptsAllowed) {
    const updated = await applyAnswerToSession(session, false, 0, false);
    if (!updated) return;
    await handleGameEnd(phone, updated, conversationId, false, attemptsUsed);
    return;
  }

  // Hint
  const hint = guess < secret ? "❄️ *Too low!*" : "🔥 *Too high!*";
  const attemptsLeft = attemptsAllowed - attemptsUsed;
  const distance = Math.abs(guess - secret);
  let heat = "";
  if (distance <= 3) heat = " 🔥🔥🔥 Super close!";
  else if (distance <= 7) heat = " 🔥 Getting warmer!";
  else if (distance <= 15) heat = " ❄️ Cold...";
  else heat = " ❄️❄️ Freezing!";

  await sendTextMessage(
    phone,
    `${hint}${heat}\n\n` +
    `*Your guess:* ${guess}\n` +
    `*Attempts left:* ${attemptsLeft}\n` +
    `*Guesses so far:* ${guesses.join(", ")}`
  );

  await sendGuessOptions(phone, session, max, attemptsAllowed, attemptsLeft, guess, secret);
}

// ═══════════════════════════════════════════════════════
// SEND GUESS OPTIONS (Smart range narrowing)
// ═══════════════════════════════════════════════════════

async function sendGuessOptions(
  phone: string,
  session: GameSession,
  max: number,
  totalAttempts: number,
  attemptsLeft: number,
  lastGuess?: number,
  _secret?: number
): Promise<void> {
  // Provide a list of 8 quick-select numbers spread evenly across the range
  const rows = [];
  const step = Math.max(1, Math.floor(max / 8));
  for (let i = 1; i <= 8; i++) {
    const num = Math.min(max, i * step);
    rows.push(makeListRow(`ng_${num}`, `🔢 ${num}`, ""));
  }

  await sendListMessage(
    phone,
    `🔢 *Guess a number (1 – ${max})*\n\n` +
    `_Or type any number in the range._\n` +
    `Attempts left: *${attemptsLeft}/${totalAttempts}*`,
    "Pick a Number",
    [{ title: "Quick Picks", rows }],
    "Number Guess",
    "Xtop Games"
  );
}

// ═══════════════════════════════════════════════════════
// END GAME
// ═══════════════════════════════════════════════════════

async function handleGameEnd(
  phone: string,
  session: GameSession,
  conversationId: string,
  isWin: boolean,
  attemptsUsed: number
): Promise<void> {
  const meta = session.metadata as { secret?: number };
  const { xp, achievements } = await finalizeGame(session, isWin);

  let msg = `🏆 *NUMBER GUESS COMPLETE!*\n\n━━━━━━━━━━━━━━━━\n`;

  if (isWin) {
    msg += `🎯 *YOU GOT IT!*\n`;
    msg += `The number was *${meta.secret}*\n`;
    msg += `Attempts used: *${attemptsUsed}*\n`;
    msg += `📊 Score: *${session.score} pts*\n`;
    msg += `⭐ XP Earned: *+${xp}*\n`;
    msg += `━━━━━━━━━━━━━━━━\n\n`;

    if (attemptsUsed <= 3) msg += `🔥 *Genius! First-try instinct!*`;
    else if (attemptsUsed <= 5) msg += `👏 *Excellent guessing!*`;
    else msg += `👍 *Nice work!*`;
  } else {
    msg += `😢 *Out of attempts!*\n`;
    msg += `The secret number was *${meta.secret}*\n`;
    msg += `⭐ XP Earned: *+${xp}*\n`;
    msg += `━━━━━━━━━━━━━━━━\n\n`;
    msg += `_Better luck next time! Try an easier level to warm up._`;
  }

  if (achievements.length > 0) {
    msg += `\n\n🏅 *Achievements:*\n${achievements.map((a) => `  • ${a}`).join("\n")}`;
  }

  await sendButtonMessage(
    phone,
    msg,
    [
      makeButton(`diff_${session.difficulty === "HARD" ? "hard" : session.difficulty === "MEDIUM" ? "med" : "easy"}_NUMBER_GUESS`, "🔁 Play Again"),
      makeButton("game_menu", "🎮 Other Games"),
      makeButton("menu_home", "🏠 Main Menu"),
    ],
    "Game Complete"
  );
}
