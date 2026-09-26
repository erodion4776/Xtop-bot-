// supabase/functions/whatsapp-webhook/modules/demos/index.ts
// Demo Centre — Main Router & Category Menus

import {
  Contact, Conversation, updateConversation,
  getActiveDemoSession,
} from "../../database.ts";
import {
  sendListMessage, sendButtonMessage, sendTextMessage,
  makeListRow, makeButton,
} from "../../whatsapp.ts";
import { normalise, isBack, safeErrorLog } from "../../utils.ts";
import { showMainMenu } from "../main-menu.ts";
import { startDemo, processDemoInput, handlePostDemoAction, processLeadCapture } from "./engine.ts";
import { getAllDemos, getDemoConfig, getDemosByCategory, getDemoCategories } from "./data.ts";

// ═══════════════════════════════════════════════════════
// DEMO CENTRE MAIN MENU
// ═══════════════════════════════════════════════════════

export async function showDemoCentreMenu(phone: string, conversationId: string): Promise<void> {
  await updateConversation(conversationId, {
    current_module: "DEMOS",
    current_state: "DEMO_CENTRE_MENU",
    context_json: {},
  });

  const categories = get
