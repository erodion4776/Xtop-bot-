// supabase/functions/whatsapp-webhook/modules/games/rock-paper-scissors.ts
// Rock Paper Scissors — Best of 3 or 5

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
import { finalizeGame } from "./engine.ts";
import { showGamesMenu } from "./index.ts";

const MOVES = ["ROCK", "PAPER", "SCISSORS"];
const MOVE_EMOJIS: Record<string, string> = { ROCK: "✊", PAPER: "✋", SCISSORS: "✌️" };

// ═══════════════════════════════════════════════════════
// START (RPS uses "difficulty" as bestOf: 3 or 5)
// ═══════════════════════════════════════════════════════

export async function start(
  phone: string,
  conversationId: string,
  bestOf: string = "3"
): Promise<void> {
  const rounds = bestOf === "5" ? 5 : 3;

  const session = await createGameSession(phone, "RPS", "MEDIUM", {
    totalRounds: rounds,
    playerWins: 0,
    botWins: 0,
    draws: 0,
    history: [],
  }, rounds);

  if (!session) {
    await sendTextMessage(phone, "⚠️ Could not start RPS. Please try again.");
    await showGamesMenu(phone, conversationId);
    return;
  }

  await sendTextMessage(
    phone,
    `✊ *ROCK PAPER SCISSORS!*\n\n` +
    `Format: *Best of ${rounds}*\n` +
    `First to *${Math.ceil(rounds / 2)}* wins!\n\n` +
    `Scoring:\n• Win = +10 pts\n• Draw = +3 pts\n• Loss = 0 pts\n\n` +
    `_Make your move!_`
  );

  await sendMoveButtons(phone, 1, rounds);
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

  let playerMove: string | null = null;
  if (rawInput === "RPS_ROCK" || rawInput.includes("ROCK") || rawInput === "✊") playerMove = "ROCK";
  else if (rawInput === "RPS_PAPER" || rawInput.includes("PAPER") || rawInput === "✋") playerMove = "PAPER";
  else if (rawInput === "RPS_SCISSORS" || rawInput.includes("SCISSORS") || rawInput === "✌️") playerMove = "SCISSORS";

  if (!playerMove) {
    await sendTextMessage(phone, "⚠️ Please choose ✊ Rock, ✋ Paper, or ✌️ Scissors.");
    return;
  }

  // Bot picks randomly (crypto-secure)
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const botMove = MOVES[buf[0] % 3];

  const meta = session.metadata as {
    totalRounds?: number;
    playerWins?: number;
    botWins?: number;
    draws?: number;
    history?: Array<{ player: string; bot: string; result: string }>;
  };
  const rounds = meta.totalRounds || 3;
  let playerWins = meta.playerWins || 0;
  let botWins = meta.botWins || 0;
  let draws = meta.draws || 0;

  let result: "WIN" | "LOSS" | "DRAW";
  let points = 0;
  let resultEmoji = "";

  if (playerMove === botMove) {
    result = "DRAW";
    points = 3;
    draws++;
    resultEmoji = "🤝";
  } else if (
    (playerMove === "ROCK" && botMove === "SCISSORS") ||
    (playerMove === "PAPER" && botMove === "ROCK") ||
    (playerMove === "SCISSORS" && botMove === "PAPER")
  ) {
    result = "WIN";
    points = 10;
    playerWins++;
    resultEmoji = "🎉";
  } else {
    result = "LOSS";
    points = 0;
    botWins++;
    resultEmoji = "😢";
  }

  const history = [...(meta.history || []), { player: playerMove, bot: botMove, result }];
  const currentRound = session.current_round + 1;

  await logGameAnswer(session.id, null, currentRound, playerMove, botMove, result === "WIN", points);

  const updated = await updateGameSession(session.id, {
    current_round: currentRound,
    score: session.score + points,
    correct_answers: session.correct_answers + (result === "WIN" ? 1 : 0),
    wrong_answers: session.wrong_answers + (result === "LOSS" ? 1 : 0),
    metadata: { ...meta, playerWins, botWins, draws, history },
  } as any);

  if (!updated) return;

  // Result message
  let msg =
    `━━━━━━━━━━━━━━━━\n` +
    `*Round ${currentRound} Result:*\n\n` +
    `You: ${MOVE_EMOJIS[playerMove]} *${playerMove}*\n` +
    `Xtop: ${MOVE_EMOJIS[botMove]} *${botMove}*\n\n` +
    `${resultEmoji} *${result === "WIN" ? "YOU WIN!" : result === "LOSS" ? "You lose." : "It's a draw!"}*\n` +
    `+${points} pts\n\n` +
    `📊 Score: You *${playerWins}* — Xtop *${botWins}* — Draws *${draws}*\n` +
    `━━━━━━━━━━━━━━━━`;

  await sendTextMessage(phone, msg);

  // Check if match is over
  const majority = Math.ceil(rounds / 2);
  if (playerWins >= majority || botWins >= majority || currentRound >= rounds) {
    await handleGameEnd(phone, updated, conversationId, playerWins, botWins, draws, rounds);
    return;
  }

  // Continue
  await sendMoveButtons(phone, currentRound + 1, rounds);
}

// ═══════════════════════════════════════════════════════
// MOVE BUTTONS
// ═══════════════════════════════════════════════════════

async function sendMoveButtons(phone: string, round: number, total: number): Promise<void> {
  await sendButtonMessage(
    phone,
    `✊ *Round ${round}/${total}*\n\nChoose your move:`,
    [
      makeButton("rps_rock", "✊ Rock"),
      makeButton("rps_paper", "✋ Paper"),
      makeButton("rps_scissors", "✌️ Scissors"),
    ],
    `Round ${round}/${total}`
  );
}

// ═══════════════════════════════════════════════════════
// END GAME
// ═══════════════════════════════════════════════════════

async function handleGameEnd(
  phone: string,
  session: GameSession,
  conversationId: string,
  playerWins: number,
  botWins: number,
  draws: number,
  rounds: number
): Promise<void> {
  const isWin = playerWins > botWins;
  const { xp, achievements } = await finalizeGame(session, isWin);

  let msg =
    `🏆 *RPS MATCH COMPLETE!*\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `*Final Score:*\n` +
    `You: *${playerWins}* wins 🎉\n` +
    `Xtop: *${botWins}* wins 🤖\n` +
    `Draws: *${draws}* 🤝\n\n` +
    `📊 Total Points: *${session.score}*\n` +
    `⭐ XP Earned: *+${xp}*\n` +
    `━━━━━━━━━━━━━━━━\n\n`;

  if (isWin) msg += `🏆 *YOU WON THE MATCH!*`;
  else if (playerWins === botWins) msg += `🤝 *It's a tie!*`;
  else msg += `🤖 *Xtop wins this round!*`;

  if (achievements.length > 0) {
    msg += `\n\n🏅 *Achievements:*\n${achievements.map((a) => `  • ${a}`).join("\n")}`;
  }

  await sendButtonMessage(
    phone,
    msg,
    [
      makeButton(`diff_rps3_RPS`, "🔁 Best of 3"),
      makeButton(`diff_rps5_RPS`, "🔁 Best of 5"),
      makeButton("game_menu", "🎮 Other Games"),
    ],
    "Match Complete"
  );
}
