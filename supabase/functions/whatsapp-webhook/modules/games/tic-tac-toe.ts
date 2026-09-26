// supabase/functions/whatsapp-webhook/modules/games/tic-tac-toe.ts

import { GameSession, createGameSession, updateGameSession, logGameAnswer } from "../../database.ts";
import { sendButtonMessage, sendTextMessage, makeButton } from "../../whatsapp.ts";
import { safeErrorLog } from "../../utils.ts";
import { finalizeGame } from "./engine.ts";
import { showGamesMenu } from "./index.ts";

// Board represented as Array(9): indices 0 to 8. 'X' = Player, 'O' = Bot, '' = Empty.
const BOARD_EMOJIS: Record<string, string> = { "X": "❌", "O": "⭕", "": "⬜" };
const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
  [0, 4, 8], [2, 4, 6]             // Diag
];

// ═══════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════
export async function start(phone: string, conversationId: string, difficulty: string): Promise<void> {
  const board = Array(9).fill("");
  const session = await createGameSession(phone, "TIC_TAC_TOE", difficulty, {
    board,
    movesCount: 0,
  });

  if (!session) {
    await sendTextMessage(phone, "⚠️ Could not start Tic-Tac-Toe. Please try again.");
    await showGamesMenu(phone, conversationId);
    return;
  }

  await sendTextMessage(
    phone,
    `❌⭕ *TIC-TAC-TOE STARTED!*\n\n` +
    `You are: ❌ (*Player*)\n` +
    `Xtop is: ⭕ (*Bot*)\n` +
    `Difficulty: *${difficulty}*\n\n` +
    `_Tap a position on the grid to make your move:_`
  );

  await sendBoardState(phone, session, board);
}

// ═══════════════════════════════════════════════════════
// INPUT HANDLER
// ═══════════════════════════════════════════════════════
export async function handleInput(
  phone: string,
  text: string,
  interactiveId: string,
  session: GameSession,
  conversationId: string
): Promise<void> {
  const rawInput = (interactiveId || text || "").trim();
  const meta = session.metadata as { board?: string[]; movesCount?: number };
  const board = meta.board || Array(9).fill("");

  if (!rawInput.startsWith("ttt_make_")) {
    await sendTextMessage(phone, "⚠️ Please tap one of the valid grid positions.");
    return;
  }

  const index = parseInt(rawInput.replace("ttt_make_", ""), 10);
  if (isNaN(index) || index < 0 || index > 8 || board[index] !== "") {
    await sendTextMessage(phone, "⚠️ Invalid move. That position is already taken.");
    return;
  }

  // 1. Player Move
  board[index] = "X";
  let moves = (meta.movesCount || 0) + 1;

  if (checkWin(board, "X")) {
    await recordMoveAndEnd(phone, session, board, "WIN", moves, conversationId);
    return;
  }

  if (board.every((cell) => cell !== "")) {
    await recordMoveAndEnd(phone, session, board, "DRAW", moves, conversationId);
    return;
  }

  // 2. Bot Move (Deterministic Strategy)
  const botIndex = getBotMove(board, session.difficulty);
  if (botIndex !== -1) {
    board[botIndex] = "O";
    moves++;

    if (checkWin(board, "O")) {
      await recordMoveAndEnd(phone, session, board, "LOSS", moves, conversationId);
      return;
    }
  }

  if (board.every((cell) => cell !== "")) {
    await recordMoveAndEnd(phone, session, board, "DRAW", moves, conversationId);
    return;
  }

  // Save session metadata
  await updateGameSession(session.id, {
    current_round: moves,
    metadata: { ...meta, board, movesCount: moves }
  } as any);

  await sendBoardState(phone, session, board);
}

// ═══════════════════════════════════════════════════════
// BOT LOGIC (Deterministic & Minimax)
// ═══════════════════════════════════════════════════════
function getBotMove(board: string[], difficulty: string): number {
  const available = board.map((c, i) => c === "" ? i : -1).filter((i) => i !== -1);
  if (available.length === 0) return -1;

  // EASY: Pure Random Move
  if (difficulty === "EASY") {
    return available[Math.floor(Math.random() * available.length)];
  }

  // MEDIUM: Win if possible, else Block Player, else center, else corner
  if (difficulty === "MEDIUM") {
    for (const move of available) {
      const copy = [...board];
      copy[move] = "O";
      if (checkWin(copy, "O")) return move;
    }
    for (const move of available) {
      const copy = [...board];
      copy[move] = "X";
      if (checkWin(copy, "X")) return move;
    }
    if (board[4] === "") return 4;
    const corners = [0, 2, 6, 8].filter((i) => board[i] === "");
    if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
    return available[0];
  }

  // HARD: Minimax (Undefeated)
  let bestVal = -Infinity;
  let bestMove = -1;

  for (const move of available) {
    board[move] = "O";
    const moveVal = minimax(board, 0, false);
    board[move] = "";
    if (moveVal > bestVal) {
      bestVal = moveVal;
      bestMove = move;
    }
  }
  return bestMove;
}

function minimax(board: string[], depth: number, isMax: boolean): number {
  if (checkWin(board, "O")) return 10 - depth;
  if (checkWin(board, "X")) return depth - 10;
  if (board.every((cell) => cell !== "")) return 0;

  const available = board.map((c, i) => c === "" ? i : -1).filter((i) => i !== -1);

  if (isMax) {
    let best = -Infinity;
    for (const move of available) {
      board[move] = "O";
      best = Math.max(best, minimax(board, depth + 1, false));
      board[move] = "";
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of available) {
      board[move] = "X";
      best = Math.min(best, minimax(board, depth + 1, true));
      board[move] = "";
    }
    return best;
  }
}

function checkWin(board: string[], player: string): boolean {
  return WIN_LINES.some((line) => line.every((idx) => board[idx] === player));
}

// ═══════════════════════════════════════════════════════
// PRESENTATION
// ═══════════════════════════════════════════════════════
async function sendBoardState(phone: string, session: GameSession, board: string[]): Promise<void> {
  const textGrid =
    `  ${BOARD_EMOJIS[board[0]]} | ${BOARD_EMOJIS[board[1]]} | ${BOARD_EMOJIS[board[2]]}\n` +
    `  ───────────\n` +
    `  ${BOARD_EMOJIS[board[3]]} | ${BOARD_EMOJIS[board[4]]} | ${BOARD_EMOJIS[board[5]]}\n` +
    `  ───────────\n` +
    `  ${BOARD_EMOJIS[board[6]]} | ${BOARD_EMOJIS[board[7]]} | ${BOARD_EMOJIS[board[8]]}`;

  const body =
    `❌⭕ *YOUR TURN!*\n\n` +
    `${textGrid}\n\n` +
    `_Select an empty position from the grid below:_`;

  // Filter out occupied spaces for buttons
  const buttons = [];
  const labels = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
  for (let i = 0; i < 9; i++) {
    if (board[i] === "" && buttons.length < 3) {
      buttons.push(makeButton(`ttt_make_${i}`, labels[i]));
    }
  }

  if (buttons.length === 0) {
    buttons.push(makeButton("game_menu", "🎮 Return to Menu"));
  }

  await sendButtonMessage(phone, body, buttons, "Tic-Tac-Toe Grid");
}

// ═══════════════════════════════════════════════════════
// RECORD MOVE & COMPLETE
// ═══════════════════════════════════════════════════════
async function recordMoveAndEnd(
  phone: string,
  session: GameSession,
  board: string[],
  outcome: "WIN" | "LOSS" | "DRAW",
  moves: number,
  conversationId: string
): Promise<void> {
  let points = 0;
  if (outcome === "WIN") points = session.difficulty === "HARD" ? 30 : session.difficulty === "MEDIUM" ? 20 : 10;
  if (outcome === "DRAW") points = 3;

  await logGameAnswer(session.id, null, moves, outcome, outcome, outcome === "WIN", points);

  const updatedSession = await updateGameSession(session.id, {
    score: points,
    correct_answers: outcome === "WIN" ? 1 : 0,
    wrong_answers: outcome === "LOSS" ? 1 : 0,
    metadata: { board, outcome, movesCount: moves }
  } as any);

  if (!updatedSession) return;

  const textGrid =
    `  ${BOARD_EMOJIS[board[0]]} | ${BOARD_EMOJIS[board[1]]} | ${BOARD_EMOJIS[board[2]]}\n` +
    `  ───────────\n` +
    `  ${BOARD_EMOJIS[board[3]]} | ${BOARD_EMOJIS[board[4]]} | ${BOARD_EMOJIS[board[5]]}\n` +
    `  ───────────\n` +
    `  ${BOARD_EMOJIS[board[6]]} | ${BOARD_EMOJIS[board[7]]} | ${BOARD_EMOJIS[board[8]]}`;

  const { xp, achievements } = await finalizeGame(updatedSession, outcome === "WIN");

  let resultHeader = "";
  if (outcome === "WIN") resultHeader = "🏆 *YOU WON THE MATCH!* 🎉";
  else if (outcome === "LOSS") resultHeader = "🤖 *XTOP WINS!* Better luck next time.";
  else resultHeader = "🤝 *IT'S A DRAW!* Well played.";

  let msg =
    `${resultHeader}\n\n` +
    `${textGrid}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📊 Final Points: *${points}*\n` +
    `⭐ XP Earned: *+${xp}*\n` +
    `━━━━━━━━━━━━━━━━\n\n`;

  if (achievements.length > 0) {
    msg += `🏅 *Achievements:*\n${achievements.map((a) => `  • ${a}`).join("\n")}`;
  }

  await sendButtonMessage(
    phone,
    msg,
    [
      makeButton(`diff_${session.difficulty.toLowerCase()}_TIC_TAC_TOE`, "🔁 Play Again"),
      makeButton("game_menu", "🎮 Other Games"),
      makeButton("menu_home", "🏠 Main Menu")
    ],
    "Game Over"
  );
}
