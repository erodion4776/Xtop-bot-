// supabase/functions/whatsapp-webhook/modules/games/dice-challenge.ts

import { GameSession, createGameSession, updateGameSession, logGameAnswer } from "../../database.ts";
import { sendButtonMessage, sendTextMessage, makeButton } from "../../whatsapp.ts";
import { finalizeGame } from "./engine.ts";
import { showGamesMenu } from "./index.ts";

const DICE_EMOJIS = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export async function start(phone: string, conversationId: string, difficulty: string = "EASY"): Promise<void> {
  const session = await createGameSession(phone, "DICE_CHALLENGE", difficulty, {
    playerWins: 0,
    botWins: 0,
    roundsPlayed: 0,
  });

  if (!session) {
    await sendTextMessage(phone, "⚠️ Could not start Dice Challenge.");
    await showGamesMenu(phone, conversationId);
    return;
  }

  await sendButtonMessage(
    phone,
    `🎲 *DICE CHALLENGE STARTED!*\n\n` +
    `Format: Best of 5 Rounds\n` +
    `Choose your rolling strategy per round:`,
    [
      makeButton("dice_roll_1", "🎲 Roll 1 Die"),
      makeButton("dice_roll_2", "🎲 Roll 2 Dice"),
      makeButton("dice_roll_3", "🎲 Roll 3 Dice"),
    ],
    "Dice Challenge"
  );
}

export async function handleInput(
  phone: string,
  text: string,
  interactiveId: string,
  session: GameSession,
  conversationId: string
): Promise<void> {
  const rawInput = (interactiveId || text || "").trim().toUpperCase();

  if (!rawInput.startsWith("DICE_ROLL_")) {
    await sendTextMessage(phone, "⚠️ Please select a dice quantity button.");
    return;
  }

  const numDice = parseInt(rawInput.replace("DICE_ROLL_", ""), 10);
  if (isNaN(numDice) || numDice < 1 || numDice > 3) {
    await sendTextMessage(phone, "⚠️ Invalid rolling size.");
    return;
  }

  const meta = session.metadata as { playerWins?: number; botWins?: number; roundsPlayed?: number };
  let playerWins = meta.playerWins || 0;
  let botWins = meta.botWins || 0;
  const round = (meta.roundsPlayed || 0) + 1;

  // Cryptographically safe roll generation on Server Side (Anti-Cheat)
  const playerRolls: number[] = [];
  const botRolls: number[] = [];
  const buf = new Uint32Array(numDice * 2);
  crypto.getRandomValues(buf);

  for (let i = 0; i < numDice; i++) {
    playerRolls.push(1 + (buf[i] % 6));
    botRolls.push(1 + (buf[i + numDice] % 6));
  }

  const pSum = playerRolls.reduce((a, b) => a + b, 0);
  const bSum = botRolls.reduce((a, b) => a + b, 0);

  let roundOutcome = "DRAW";
  let roundPoints = 3;
  if (pSum > bSum) {
    roundOutcome = "WIN";
    roundPoints = 10;
    playerWins++;
  } else if (pSum < bSum) {
    roundOutcome = "LOSS";
    roundPoints = 0;
    botWins++;
  }

  await logGameAnswer(session.id, null, round, playerRolls.join(","), botRolls.join(","), roundOutcome === "WIN", roundPoints);

  const updatedSession = await updateGameSession(session.id, {
    current_round: round,
    score: session.score + roundPoints,
    correct_answers: session.correct_answers + (roundOutcome === "WIN" ? 1 : 0),
    wrong_answers: session.wrong_answers + (roundOutcome === "LOSS" ? 1 : 0),
    metadata: { ...meta, playerWins, botWins, roundsPlayed: round }
  } as any);

  if (!updatedSession) return;

  const playerDiceGraphic = playerRolls.map((val) => DICE_EMOJIS[val - 1]).join(" ");
  const botDiceGraphic = botRolls.map((val) => DICE_EMOJIS[val - 1]).join(" ");

  const roundMessage =
    `🎲 *ROUND ${round}/5 RESULT*\n\n` +
    `You Rolled: ${playerDiceGraphic}  (Total: *${pSum}*)\n` +
    `Xtop Rolled: ${botDiceGraphic}  (Total: *${bSum}*)\n\n` +
    `Result: *${roundOutcome === "WIN" ? "🎉 YOU WIN!" : roundOutcome === "LOSS" ? "😢 XTOP WINS" : "🤝 DRAW"}*\n` +
    `+${roundPoints} Points\n\n` +
    `📊 Match Score: You *${playerWins}* — Xtop *${botWins}*`;

  await sendTextMessage(phone, roundMessage);

  if (round >= 5 || playerWins >= 3 || botWins >= 3) {
    await handleGameEnd(phone, updatedSession, conversationId, playerWins, botWins, round);
    return;
  }

  await sendButtonMessage(
    phone,
    `Choose your rolling strategy for *Round ${round + 1}*:`,
    [
      makeButton("dice_roll_1", "🎲 Roll 1 Die"),
      makeButton("dice_roll_2", "🎲 Roll 2 Dice"),
      makeButton("dice_roll_3", "🎲 Roll 3 Dice"),
    ],
    "Dice Challenge"
  );
}

async function handleGameEnd(
  phone: string,
  session: GameSession,
  conversationId: string,
  playerWins: number,
  botWins: number,
  rounds: number
): Promise<void> {
  const isWin = playerWins > botWins;
  const { xp, achievements } = await finalizeGame(session, isWin);

  let msg =
    `🏆 *DICE CHALLENGE COMPLETE!*\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `*Final Standings:*\n` +
    `• Your Wins: *${playerWins}*\n` +
    `• Xtop Wins: *${botWins}*\n\n` +
    `📊 Match Points: *${session.score}*\n` +
    `⭐ XP Earned: *+${xp}*\n` +
    `━━━━━━━━━━━━━━━━\n\n`;

  if (isWin) msg += `🏆 *YOU WON THE CHALLENGE!* 🎉`;
  else if (playerWins === botWins) msg += `🤝 *The challenge ended in a tie.*`;
  else msg += `🤖 *Xtop wins this challenge.*`;

  if (achievements.length > 0) {
    msg += `\n\n🏅 *Achievements:*\n${achievements.map((a) => `  • ${a}`).join("\n")}`;
  }

  await sendButtonMessage(
    phone,
    msg,
    [
      makeButton("diff_easy_DICE_CHALLENGE", "🔁 Play Again"),
      makeButton("game_menu", "🎮 Other Games"),
      makeButton("menu_home", "🏠 Main Menu"),
    ],
    "Match Complete"
  );
}
