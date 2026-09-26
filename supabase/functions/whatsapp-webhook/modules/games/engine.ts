// supabase/functions/whatsapp-webhook/modules/games/engine.ts
// Reusable Game Engine — Scoring, XP, Streaks, Anti-Cheat

import {
  GameSession,
  updateGameSession,
  recordGameScore,
  updateUserGameStats,
  awardAchievement,
  completeGameSession,
} from "../../database.ts";

// ═══════════════════════════════════════════════════════
// DIFFICULTY POINTS TABLE
// ═══════════════════════════════════════════════════════
export const DIFFICULTY_POINTS: Record<string, number> = {
  EASY: 10,
  MEDIUM: 20,
  HARD: 30,
};

// ═══════════════════════════════════════════════════════
// SCORING (server-authoritative)
// ═══════════════════════════════════════════════════════

export function calculatePoints(
  difficulty: string,
  streak: number,
  isCorrect: boolean
): number {
  if (!isCorrect) return 0;
  const base = DIFFICULTY_POINTS[difficulty] || 10;
  let bonus = 0;
  if (streak >= 5) bonus = 10;
  else if (streak >= 3) bonus = 5;
  return base + bonus;
}

// ═══════════════════════════════════════════════════════
// XP CALCULATION
// ═══════════════════════════════════════════════════════

export function calculateXp(session: GameSession, isWin: boolean): number {
  let xp = 0;
  xp += session.correct_answers * 5;          // 5 XP per correct
  xp += 10;                                    // Game completion
  if (isWin) xp += 15;                        // Win bonus
  if (session.max_streak >= 3) xp += 20;      // Streak bonus
  return xp;
}

// ═══════════════════════════════════════════════════════
// UPDATE SESSION AFTER ANSWER
// ═══════════════════════════════════════════════════════

export async function applyAnswerToSession(
  session: GameSession,
  isCorrect: boolean,
  points: number,
  advanceQuestion: boolean = true
): Promise<GameSession | null> {
  const newStreak = isCorrect ? session.streak + 1 : 0;
  const newMaxStreak = Math.max(session.max_streak, newStreak);

  return await updateGameSession(session.id, {
    score: session.score + points,
    correct_answers: session.correct_answers + (isCorrect ? 1 : 0),
    wrong_answers: session.wrong_answers + (isCorrect ? 0 : 1),
    streak: newStreak,
    max_streak: newMaxStreak,
    current_question: advanceQuestion
      ? session.current_question + 1
      : session.current_question,
  } as any);
}

// ═══════════════════════════════════════════════════════
// FINALIZE GAME (compute XP, save, award achievements)
// ═══════════════════════════════════════════════════════

export async function finalizeGame(
  session: GameSession,
  isWin: boolean,
  displayName?: string
): Promise<{ xp: number; achievements: string[] }> {
  const xp = calculateXp(session, isWin);
  await completeGameSession(session.id);
  await recordGameScore(session, xp);
  await updateUserGameStats(
    session.phone_number,
    session.score,
    xp,
    isWin,
    session.max_streak,
    displayName
  );

  // Award achievements
  const awarded: string[] = [];
  const totalQ = session.correct_answers + session.wrong_answers;

  if (await awardAchievement(session.phone_number, "FIRST_GAME", "First Game", "🎮")) {
    awarded.push("🎮 First Game");
  }

  if (totalQ > 0 && session.wrong_answers === 0 && session.correct_answers >= 5) {
    if (await awardAchievement(session.phone_number, "PERFECT_SCORE", "Perfect Score", "🎯")) {
      awarded.push("🎯 Perfect Score");
    }
  }

  if (session.max_streak >= 5) {
    if (await awardAchievement(session.phone_number, "STREAK_5", "5-Streak Master", "🔥")) {
      awarded.push("🔥 5-Streak Master");
    }
  }

  if (session.max_streak >= 10) {
    if (await awardAchievement(session.phone_number, "STREAK_10", "10-Streak Legend", "🔥🔥")) {
      awarded.push("🔥🔥 10-Streak Legend");
    }
  }

  if (session.game_type === "TRIVIA" && session.correct_answers >= 8) {
    if (await awardAchievement(session.phone_number, "TRIVIA_MASTER", "Trivia Master", "🧠")) {
      awarded.push("🧠 Trivia Master");
    }
  }

  if (session.game_type === "MATH_BATTLE" && session.correct_answers >= 8) {
    if (await awardAchievement(session.phone_number, "MATH_MASTER", "Math Master", "➗")) {
      awarded.push("➗ Math Master");
    }
  }

  return { xp, achievements: awarded };
}

// ═══════════════════════════════════════════════════════
// ANTI-CHEAT: VALIDATE ANSWER OWNERSHIP
// ═══════════════════════════════════════════════════════

export function validateAnswerOwnership(
  session: GameSession,
  submittedQuestionIndex: number
): boolean {
  return session.current_question === submittedQuestionIndex && session.status === "ACTIVE";
}

// ═══════════════════════════════════════════════════════
// COMMON GAME INTERFACE
// ═══════════════════════════════════════════════════════

export interface GameEngine {
  start(phone: string, conversationId: string, difficulty: string): Promise<void>;
  handleInput(
    phone: string,
    text: string,
    interactiveId: string,
    session: GameSession,
    conversationId: string
  ): Promise<void>;
}
