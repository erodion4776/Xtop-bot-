// supabase/functions/whatsapp-webhook/modules/games/index.ts

import {
  Contact, Conversation, updateConversation,
  getActiveGameSession, abandonActiveSessions, getUserGameStats,
} from "../../database.ts";
import { sendListMessage, sendButtonMessage, sendTextMessage, makeListRow, makeButton } from "../../whatsapp.ts";
import { normalise, isBack, extractSelection, safeErrorLog } from "../../utils.ts";
import { showMainMenu } from "../main-menu.ts";

// Game handlers
import * as Trivia from "./trivia.ts";
import * as MathBattle from "./math-battle.ts";
import * as NumberGuess from "./number-guess.ts";
import * as Riddles from "./riddles.ts";
import * as RPS from "./rock-paper-scissors.ts";
import * as WordScramble from "./word-scramble.ts";
import * as TicTacToe from "./tic-tac-toe.ts";
import * as EmojiGuess from "./emoji-guess.ts";
import * as DiceChallenge from "./dice-challenge.ts";
import { displayLeaderboard } from "./leaderboard.ts";
import { runDailyChallenge } from "./daily-challenge.ts";

export async function showGamesMenu(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "GAMES",
    current_state: "SELECTING_GAME",
    context_json: {},
  });

  await sendListMessage(
    phone,
    `🎮 *XTOP GAMES ARENA*\n\nChallenge your mind, earn XP, and climb the leaderboards directly on WhatsApp!\n\n👇 *Select a game to start:*`,
    "Select Game",
    [
      {
        title: "Brain & Reasoning Games",
        rows: [
          makeListRow("game_trivia", "1️⃣ Trivia Challenge", "10 general knowledge questions"),
          makeListRow("game_math", "2️⃣ Math Battle", "Arithmetic calculation sprint"),
          makeListRow("game_riddle", "3️⃣ Riddle Master", "Solve clever, creative word riddles"),
          makeListRow("game_word", "4️⃣ Word Scramble", "Unscramble target vocabulary"),
          makeListRow("game_emoji", "5️⃣ Emoji Guess", "Decode icons into words"),
        ],
      },
      {
        title: "Arcade & Fun Utilities",
        rows: [
          makeListRow("game_number", "6️⃣ Number Guess", "Solve secret hot/cold numbers"),
          makeListRow("game_rps", "7️⃣ Rock Paper Scissors", "Play classic Best-of matches"),
          makeListRow("game_ttt", "8️⃣ Tic-Tac-Toe", "Versus unbeatable Minimax AI"),
          makeListRow("game_dice", "9️⃣ Dice Challenge", "Safely roll for sum totals"),
          makeListRow("game_daily", "📅 Seeded Daily Challenge", "One attempt daily limit"),
          makeListRow("game_leaderboard", "🏆 Leaderboard Rankings", "Climb the global ranks"),
          makeListRow("game_back_menu", "🔙 Main Menu", "Return to homepage"),
        ],
      },
    ],
    "Xtop Games Arena",
    "Sabi Assistant Engine"
  );
}

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

  if (gameCode === "RPS") {
    await sendButtonMessage(
      phone,
      `✊ *Rock Paper Scissors — Choose Format*\n\nSelect a match size:`,
      [
        makeButton(`diff_rps3_RPS`, "Best of 3"),
        makeButton(`diff_rps5_RPS`, "Best of 5"),
      ],
      "Format Selector"
    );
    return;
  }

  await sendButtonMessage(
    phone,
    `🎯 *Select Difficulty*\n\n🟢 *Easy* → 10 pts per correct\n🟡 *Medium* → 20 pts per correct\n🔴 *Hard* → 30 pts per correct`,
    [
      makeButton(`diff_easy_${gameCode}`, "🟢 Easy"),
      makeButton(`diff_med_${gameCode}`, "🟡 Medium"),
      makeButton(`diff_hard_${gameCode}`, "🔴 Hard"),
    ],
    "Choose Difficulty"
  );
}

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

    if (n === "games_menu" || rawInput === "game_menu" || n.includes("other games") || rawInput === "tools_all") {
      await abandonActiveSessions(phone);
      await showGamesMenu(phone, conv.id);
      return;
    }

    if (rawInput.startsWith("diff_")) {
      const parts = rawInput.split("_");
      const level = parts[1];
      const gameCode = parts.slice(2).join("_");

      if (level === "rps3" || level === "rps5") {
        await RPS.start(phone, conv.id, level === "rps5" ? "5" : "3");
        return;
      }

      await startGameByCode(gameCode, phone, conv.id, level.toUpperCase());
      return;
    }

    const session = await getActiveGameSession(phone);
    if (session) {
      await routeToActiveGame(session, phone, text, rawInput, conv);
      return;
    }

    if (rawInput === "game_leaderboard" || n.includes("leaderboard")) {
      await displayLeaderboard(phone, conv.id);
      return;
    }

    if (rawInput === "game_daily" || n.includes("daily challenge")) {
      await runDailyChallenge(phone, conv.id);
      return;
    }

    if (state === "SELECTING_GAME" || !session) {
      await processGameSelection(phone, rawInput, conv);
      return;
    }

    await showGamesMenu(phone, conv.id);
  } catch (err) {
    safeErrorLog("handleGames", err);
    await sendTextMessage(phone, "⚠️ An error occurred while processing your game. Tap button to restart:");
    await showGamesMenu(phone, conv.id);
  }
}

async function processGameSelection(phone: string, input: string, conv: Conversation): Promise<void> {
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
  if (input === "game_riddle" || num === 3 || n.includes("riddle")) {
    await showDifficultySelector(phone, conv.id, "RIDDLE");
    return;
  }
  if (input === "game_word" || num === 4 || n.includes("scramble") || n.includes("word")) {
    await showDifficultySelector(phone, conv.id, "WORD_SCRAMBLE");
    return;
  }
  if (input === "game_emoji" || num === 5 || n.includes("emoji")) {
    await showDifficultySelector(phone, conv.id, "EMOJI_GUESS");
    return;
  }
  if (input === "game_number" || num === 6 || n.includes("number")) {
    await showDifficultySelector(phone, conv.id, "NUMBER_GUESS");
    return;
  }
  if (input === "game_rps" || num === 7 || n.includes("rock") || n.includes("rps")) {
    await showDifficultySelector(phone, conv.id, "RPS");
    return;
  }
  if (input === "game_ttt" || num === 8 || n.includes("tic") || n.includes("toe")) {
    await showDifficultySelector(phone, conv.id, "TIC_TAC_TOE");
    return;
  }
  if (input === "game_dice" || num === 9 || n.includes("dice")) {
    await showDifficultySelector(phone, conv.id, "DICE_CHALLENGE");
    return;
  }
  if (input === "game_daily" || n.includes("daily")) {
    await runDailyChallenge(phone, conv.id);
    return;
  }
  if (input === "game_leaderboard" || n.includes("leaderboard")) {
    await displayLeaderboard(phone, conv.id);
    return;
  }

  await showGamesMenu(phone, conv.id);
}

async function startGameByCode(code: string, phone: string, convId: string, difficulty: string): Promise<void> {
  const diffUpper = difficulty.toUpperCase();
  switch (code) {
    case "TRIVIA":
      await Trivia.start(phone, convId, diffUpper);
      break;
    case "MATH_BATTLE":
      await MathBattle.start(phone, convId, diffUpper);
      break;
    case "NUMBER_GUESS":
      await NumberGuess.start(phone, convId, diffUpper);
      break;
    case "RIDDLE":
      await Riddles.start(phone, convId, diffUpper);
      break;
    case "WORD_SCRAMBLE":
      await WordScramble.start(phone, convId, diffUpper);
      break;
    case "TIC_TAC_TOE":
      await TicTacToe.start(phone, convId, diffUpper);
      break;
    case "EMOJI_GUESS":
      await EmojiGuess.start(phone, convId, diffUpper);
      break;
    case "DICE_CHALLENGE":
      await DiceChallenge.start(phone, convId, diffUpper);
      break;
    default:
      await showGamesMenu(phone, convId);
  }
}

async function routeToActiveGame(session: any, phone: string, text: string, interactiveId: string, conv: Conversation): Promise<void> {
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
    case "TIC_TAC_TOE":
      await TicTacToe.handleInput(phone, text, interactiveId, session, conv.id);
      break;
    case "EMOJI_GUESS":
      await EmojiGuess.handleInput(phone, text, interactiveId, session, conv.id);
      break;
    case "DICE_CHALLENGE":
      await DiceChallenge.handleInput(phone, text, interactiveId, session, conv.id);
      break;
    default:
      await abandonActiveSessions(phone);
      await showGamesMenu(phone, conv.id);
  }
}
