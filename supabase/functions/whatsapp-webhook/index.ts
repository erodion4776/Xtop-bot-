// supabase/functions/whatsapp-webhook/modules/games/index.ts
// Central Games Module Router

import {
  Contact,
  Conversation,
  updateConversation,
  getActiveGameSession,
  abandonActiveSessions,
  getUserGameStats,
} from "../../database.ts";
import {
  sendListMessage,
  sendButtonMessage,
  sendTextMessage,
  makeListRow,
  makeButton,
} from "../../whatsapp.ts";
import { normalise, isBack, extractSelection, safeErrorLog } from "../../utils.ts";
import { showMainMenu } from "../main-menu.ts";

// Game handlers
import * as Trivia from "./trivia.ts";
import * as MathBattle from "./math-battle.ts";
import * as NumberGuess from "./number-guess.ts";
import * as Riddles from "./riddles.ts";
import * as RPS from "./rock-paper-scissors.ts";
import * as WordScramble from "./word-scramble.ts";

// ═══════════════════════════════════════════════════════
// GAMES MENU
// ═══════════════════════════════════════════════════════

export async function showGamesMenu(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "GAMES",
    current_state: "SELECTING_GAME",
    context_json: {},
  });

  await sendListMessage(
    phone,
    `🎮 *XTOP GAMES*\n\nChallenge your mind, earn XP, and climb the leaderboard!\n\n👇 *Choose a game:*`,
    "Choose Game",
    [
      {
        title: "Brain & Words",
        rows: [
          makeListRow("game_trivia", "1️⃣ Trivia Challenge", "10 general knowledge questions"),
          makeListRow("game_math", "2️⃣ Math Battle", "Arithmetic showdown"),
          makeListRow("game_riddle", "4️⃣ Riddle Master", "Solve creative riddles"),
          makeListRow("game_word", "7️⃣ Word Scramble", "Unscramble the word"),
          makeListRow("game_emoji", "8️⃣ Emoji Guess", "Coming soon"),
        ],
      },
      {
        title: "Action & Fun",
        rows: [
          makeListRow("game_number", "3️⃣ Number Guess", "Guess the secret number"),
          makeListRow("game_rps", "5️⃣ Rock Paper Scissors", "Best of 3 or 5"),
          makeListRow("game_ttt", "6️⃣ Tic-Tac-Toe", "Coming soon"),
          makeListRow("game_dice", "9️⃣ Dice Challenge", "Coming soon"),
          makeListRow("game_leaderboard", "🏆 Leaderboard", "Top players"),
          makeListRow("game_back_menu", "🔙 Main Menu", "Return to home"),
        ],
      },
    ],
    "Xtop Games Arena",
    "Powered by Sabi"
  );
}

// ═══════════════════════════════════════════════════════
// DIFFICULTY SELECTOR (shared)
// ═══════════════════════════════════════════════════════

export async function showDifficultySelector(
  phone: string,
  conversationId: string,
  gameCode: string
): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "GAMES",
    current_state: "SELECTING_DIFFICULTY",
    context_json: { pendingGame: gameCode },
  });

  // Special case: RPS uses "Best of X"
  if (gameCode === "RPS") {
    await sendButtonMessage(
      phone,
      `✊ *Rock Paper Scissors — Choose Format*\n\nBest of 3 (first to 2 wins)\nBest of 5 (first to 3 wins)`,
      [
        makeButton(`diff_rps3_RPS`, "Best of 3"),
        makeButton(`diff_rps5_RPS`, "Best of 5"),
      ],
      "Choose Format"
    );
    return;
  }

  await sendButtonMessage(
    phone,
    `🎯 *Select Difficulty*\n\nChoose your challenge level:\n\n🟢 *Easy* → 10 pts per correct\n🟡 *Medium* → 20 pts per correct\n🔴 *Hard* → 30 pts per correct\n\n_Bonus: 3+ streak = +5, 5+ streak = +10_`,
    [
      makeButton(`diff_easy_${gameCode}`, "🟢 Easy"),
      makeButton(`diff_med_${gameCode}`, "🟡 Medium"),
      makeButton(`diff_hard_${gameCode}`, "🔴 Hard"),
    ],
    "Choose Difficulty"
  );
}

// ═══════════════════════════════════════════════════════
// MAIN GAMES HANDLER
// ═══════════════════════════════════════════════════════

export async function handleGames(
  phone: string,
  text: string,
  contact: Contact,
  conv: Conversation,
  interactiveId?: string
): Promise<void> {
  const rawInput = (interactiveId || text || "").trim();
  const n = normalise(rawInput);
  const state = conv.current_state;

  try {
    // ── EXIT / MENU ──
    if (n === "menu_home" || n === "main menu" || rawInput === "game_back_menu") {
      await abandonActiveSessions(phone);
      await updateConversation(conv.id, {
        current_module: "MAIN_MENU",
        current_state: "IDLE",
        context_json: {},
      });
      await showMainMenu(phone, conv.id);
      return;
    }

    if (n === "games_menu" || rawInput === "game_menu" || n.includes("other games")) {
      await abandonActiveSessions(phone);
      await showGamesMenu(phone, conv.id);
      return;
    }

    // ── DIFFICULTY / FORMAT SELECTION ──
    if (rawInput.startsWith("diff_")) {
      const parts = rawInput.split("_");
      const level = parts[1]; // easy | med | hard | rps3 | rps5
      const gameCode = parts.slice(2).join("_");

      // Handle RPS special format
      if (level === "rps3" || level === "rps5") {
        const bestOf = level === "rps5" ? "5" : "3";
        await RPS.start(phone, conv.id, bestOf);
        return;
      }

      const difficulty = level === "easy" ? "EASY" : level === "med" ? "MEDIUM" : "HARD";
      await startGameByCode(gameCode, phone, conv.id, difficulty);
      return;
    }

    // ── ACTIVE GAME ROUTING ──
    const session = await getActiveGameSession(phone);
    if (session) {
      await routeToActiveGame(session, phone, text, rawInput, conv);
      return;
    }

    // ── LEADERBOARD ──
    if (rawInput === "game_leaderboard" || n.includes("leaderboard")) {
      await showLeaderboardStub(phone, conv.id);
      return;
    }

    // ── GAME SELECTION (Menu) ──
    if (state === "SELECTING_GAME" || !session) {
      await processGameSelection(phone, rawInput, conv);
      return;
    }

    await showGamesMenu(phone, conv.id);
  } catch (err) {
    safeErrorLog("handleGames", err);
    await sendTextMessage(
      phone,
      "⚠️ Something went wrong while processing your game.\n\nPlease try again or type *menu*."
    );
  }
}

// ═══════════════════════════════════════════════════════
// PROCESS GAME SELECTION
// ═══════════════════════════════════════════════════════

async function processGameSelection(
  phone: string,
  input: string,
  conv: Conversation
): Promise<void> {
  const n = normalise(input);
  const num = extractSelection(input);

  if (input === "game_trivia" || num === 1 || n.includes("trivia")) {
    await showDifficultySelector(phone, conv.id, "TRIVIA");
    return;
  }
  if (input === "game_math" || num === 2 || n.includes("math")) {
    await showDifficultySelector(phone, conv.id, "MATH_BATTLE");
    return;
  }
  if (input === "game_number" || num === 3 || n.includes("number guess") || n.includes("number")) {
    await showDifficultySelector(phone, conv.id, "NUMBER_GUESS");
    return;
  }
  if (input === "game_riddle" || num === 4 || n.includes("riddle")) {
    await showDifficultySelector(phone, conv.id, "RIDDLE");
    return;
  }
  if (input === "game_rps" || num === 5 || n.includes("rock") || n.includes("rps")) {
    await showDifficultySelector(phone, conv.id, "RPS");
    return;
  }
  if (input === "game_word" || num === 7 || n.includes("word") || n.includes("scramble")) {
    await showDifficultySelector(phone, conv.id, "WORD_SCRAMBLE");
    return;
  }
  if (input === "game_leaderboard" || n.includes("leaderboard")) {
    await showLeaderboardStub(phone, conv.id);
    return;
  }

  // Coming-soon
  const comingSoon: Record<string, string> = {
    game_ttt: "❌ Tic-Tac-Toe",
    game_emoji: "😀 Emoji Guess",
    game_dice: "🎲 Dice Challenge",
  };
  if (comingSoon[input]) {
    await sendButtonMessage(
      phone,
      `${comingSoon[input]}\n\n🚧 *Coming very soon!*\n\nWe're building this game right now. Meanwhile, try one of our live games!`,
      [makeButton("game_menu", "🎮 Games Menu"), makeButton("menu_home", "🏠 Main Menu")],
      "Coming Soon"
    );
    return;
  }

  await showGamesMenu(phone, conv.id);
}

// ═══════════════════════════════════════════════════════
// START GAME BY CODE
// ═══════════════════════════════════════════════════════

async function startGameByCode(
  code: string,
  phone: string,
  convId: string,
  difficulty: string
): Promise<void> {
  switch (code) {
    case "TRIVIA":
      await Trivia.start(phone, convId, difficulty);
      break;
    case "MATH_BATTLE":
      await MathBattle.start(phone, convId, difficulty);
      break;
    case "NUMBER_GUESS":
      await NumberGuess.start(phone, convId, difficulty);
      break;
    case "RIDDLE":
      await Riddles.start(phone, convId, difficulty);
      break;
    case "WORD_SCRAMBLE":
      await WordScramble.start(phone, convId, difficulty);
      break;
    default:
      await sendTextMessage(phone, "⚠️ Game not yet available.");
      await showGamesMenu(phone, convId);
  }
}

// ═══════════════════════════════════════════════════════
// ROUTE INPUT TO ACTIVE GAME
// ═══════════════════════════════════════════════════════

async function routeToActiveGame(
  session: any,
  phone: string,
  text: string,
  interactiveId: string,
  conv: Conversation
): Promise<void> {
  switch (session.game_type) {
    case "TRIVIA":
      await Trivia.handleInput(phone, text, interactiveId, session, conv.id);
      break;
    case "MATH_BATTLE":
      await MathBattle.handleInput(phone, text, interactiveId, session, conv.id);
      break;
    case "NUMBER_GUESS":
      await NumberGuess.handleInput(phone, text, interactiveId, session, conv.id);
      break;
    case "RIDDLE":
      await Riddles.handleInput(phone, text, interactiveId, session, conv.id);
      break;
    case "RPS":
      await RPS.handleInput(phone, text, interactiveId, session, conv.id);
      break;
    case "WORD_SCRAMBLE":
      await WordScramble.handleInput(phone, text, interactiveId, session, conv.id);
      break;
    default:
      await abandonActiveSessions(phone);
      await showGamesMenu(phone, conv.id);
  }
}

// ═══════════════════════════════════════════════════════
// LEADERBOARD STUB (Phase 4 will expand)
// ═══════════════════════════════════════════════════════

async function showLeaderboardStub(phone: string, conversationId: string): Promise<void> {
  const stats = await getUserGameStats(phone);
  const msg =
    `🏆 *XTOP GAMES LEADERBOARD*\n\n` +
    `_Full ranking coming in Phase 4!_\n\n` +
    (stats
      ? `📊 *Your Stats*\n` +
        `• *Games Played:* ${stats.total_games}\n` +
        `• *Total Score:* ${stats.total_score.toLocaleString()}\n` +
        `• *Total XP:* ${stats.total_xp}\n` +
        `• *Level:* ${stats.current_level} ⭐\n` +
        `• *Best Streak:* ${stats.best_streak} 🔥`
      : `_Play a game to see your stats here!_`);

  await sendButtonMessage(
    phone,
    msg,
    [makeButton("game_menu", "🎮 Games Menu"), makeButton("menu_home", "🏠 Main Menu")],
    "Leaderboard"
  );

  await updateConversation(conversationId, {
    current_module: "GAMES",
    current_state: "SELECTING_GAME",
    context_json: {},
  });
}
