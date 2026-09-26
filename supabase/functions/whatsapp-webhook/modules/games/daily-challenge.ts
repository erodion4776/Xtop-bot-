// supabase/functions/whatsapp-webhook/modules/games/daily-challenge.ts

import { getSupabaseClient } from "../../database.ts";
import { sendButtonMessage, sendTextMessage, makeButton } from "../../whatsapp.ts";
import * as Trivia from "./trivia.ts";
import * as MathBattle from "./math-battle.ts";

export async function runDailyChallenge(phone: string, conversationId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const todayDateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // Check if player has already entered the daily challenge today
  const { data: attempt } = await supabase
    .from("game_sessions")
    .select("id")
    .eq("phone_number", phone)
    .eq("difficulty", "HARD")
    .ilike("started_at", `${todayDateStr}%`)
    .limit(1)
    .maybeSingle();

  if (attempt) {
    await sendButtonMessage(
      phone,
      `📅 *DAILY CHALLENGE COMPLETED*\n\n` +
      `You have already attempted today's seeded daily challenge.\n\n` +
      `New challenges unlock daily at *00:00 UTC*.\n\n` +
      `Test your skills on other standard games below:`,
      [
        makeButton("game_menu", "🎮 Games Menu"),
        makeButton("menu_home", "🏠 Main Menu")
      ],
      "Daily Challenge Limit"
    );
    return;
  }

  // Date seeded challenge logic (alternates between Math and Trivia on hard level)
  const dateHash = todayDateStr.split("-").reduce((acc, val) => acc + parseInt(val, 10), 0);
  const challengeType = dateHash % 2 === 0 ? "MATH_BATTLE" : "TRIVIA";

  await sendTextMessage(phone, "📅 Entering today's Seeded Daily Challenge...");
  if (challengeType === "MATH_BATTLE") {
    await MathBattle.start(phone, conversationId, "HARD");
  } else {
    await Trivia.start(phone, conversationId, "HARD");
  }
}
