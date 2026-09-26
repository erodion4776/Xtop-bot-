// supabase/functions/whatsapp-webhook/modules/games/leaderboard.ts

import { getSupabaseClient, getUserGameStats } from "../../database.ts";
import { sendButtonMessage, makeButton } from "../../whatsapp.ts";

export async function displayLeaderboard(phone: string, conversationId: string, period: string = "ALL_TIME"): Promise<void> {
  const supabase = getSupabaseClient();

  // Retrieve top 5 players based on total score
  const { data: topPlayers, error } = await supabase
    .from("user_game_stats")
    .select("phone_number, display_name, total_score, total_xp, current_level")
    .order("total_score", { ascending: false })
    .limit(5);

  let msg = `🏆 *XTOP GAMES LEADERBOARD (${period.replace("_", " ")})*\n\n`;

  if (error || !topPlayers || topPlayers.length === 0) {
    msg += `_Leaderboard stats are compiling. Check back shortly!_\n\n`;
  } else {
    topPlayers.forEach((player, idx) => {
      // Mask phone number for strict privacy
      const displayId = player.display_name || `Player-${player.phone_number.substring(0, 7)}***${player.phone_number.slice(-2)}`;
      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "🎖️";
      msg += `${medal} *${idx + 1}. ${displayId}*\n` +
             `   └ Level ${player.current_level} | Score: *${player.total_score.toLocaleString()}* | XP: *${player.total_xp}*\n\n`;
    });
  }

  // Load request user's individual placement stats
  const stats = await getUserGameStats(phone);
  if (stats) {
    msg += `📊 *Your Performance Overview*\n` +
           `• *Rank:* Processing...\n` +
           `• *Level:* ${stats.current_level} ⭐\n` +
           `• *Total Score:* ${stats.total_score.toLocaleString()}\n` +
           `• *Total XP:* ${stats.total_xp}\n` +
           `• *Games Played:* ${stats.total_games}\n\n`;
  }

  await sendButtonMessage(
    phone,
    msg,
    [
      makeButton("game_menu", "🎮 Games Menu"),
      makeButton("menu_home", "🏠 Main Menu")
    ],
    "Leaderboards"
  );
}
