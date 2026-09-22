// supabase/functions/whatsapp-webhook/modules/attendance.ts
// Phase 4 — Student Registration & Daily Attendance Gate
// Strictly collects official academic name regardless of WhatsApp profile name.

import {
  Contact, Conversation, updateConversation,
  Student,
  getStudentByPhone, createStudentProfile,
  recordAttendance, getTodayAttendance, isStudentProfileComplete,
} from "../database.ts";
import {
  sendButtonMessage, sendListMessage, sendTextMessage,
  makeButton, makeListRow,
} from "../whatsapp.ts";
import { normalise, isBack, isExit } from "../utils.ts";
import { showMainMenu } from "./main-menu.ts";

// ═══════════════════════════════════════════════════════
// REGISTRATION CONTEXT
// ═══════════════════════════════════════════════════════

interface RegCtx {
  step: string;
  regName?: string;
  regMatric?: string;
  regDept?: string;
}

// ═══════════════════════════════════════════════════════
// MAIN REGISTRATION HANDLER
// ═══════════════════════════════════════════════════════

export async function handleRegistration(
  phone: string, text: string, contact: Contact, conv: Conversation
): Promise<boolean> {
  const n = normalise(text);
  const state = conv.current_state;
  const ctx = (conv.context_json || {}) as RegCtx;

  // Global interrupts during registration
  if (isGreeting(text) && state !== "ENTRY") {
    await updateConversation(conv.id, {
      current_module: "MAIN_MENU", current_state: "IDLE", context_json: {},
    });
    await showMainMenu(phone, conv.id);
    return false;
  }
  if (isExit(text)) {
    await updateConversation(conv.id, {
      current_module: "MAIN_MENU", current_state: "IDLE", context_json: {},
    });
    await sendTextMessage(phone, "👋 You have exited the *Engr. Ero Learning Centre*.\n\nType *menu* to return.");
    return false;
  }

  switch (state) {
    case "ENTRY":
      return await checkStudentAndRoute(phone, contact, conv);

    case "WAITING_STUDENT_NAME":
      return await processNameInput(phone, text, contact, conv, ctx);

    case "WAITING_MATRIC_NUMBER":
      return await processMatricInput(phone, text, contact, conv, ctx);

    case "WAITING_DEPARTMENT":
      return await processDeptInput(phone, text, contact, conv, ctx);

    case "WAITING_LEVEL":
      return await processLevelInput(phone, text, contact, conv, ctx);

    default:
      return await checkStudentAndRoute(phone, contact, conv);
  }
}

function isGreeting(text: string): boolean {
  const n = normalise(text);
  return n === "hi" || n === "hello" || n === "hey" || n === "start" || n === "menu" || n === "home";
}

// ═══════════════════════════════════════════════════════
// STEP 1: CHECK STUDENT BY PHONE
// ═══════════════════════════════════════════════════════

async function checkStudentAndRoute(
  phone: string, contact: Contact, conv: Conversation
): Promise<boolean> {
  const student = await getStudentByPhone(phone);

  // If student profile is complete with a valid matric number, they are fully registered
  if (student && isStudentProfileComplete(student)) {
    return await handleReturningStudent(phone, student, conv);
  }

  // If they have never registered before (no matric_number), we MUST collect their official name
  await updateConversation(conv.id, {
    current_module: "LEARNING",
    current_state: "WAITING_STUDENT_NAME",
    context_json: { step: "WAITING_STUDENT_NAME" },
  });

  await sendTextMessage(phone,
    `🎓 *ENGR. ERO LEARNING CENTRE*\n\n` +
    `Welcome to the Learning Centre.\n\n` +
    `Before you continue, we need to register your student profile with your *official academic details*.\n\n` +
    `*Please enter your official full name (Surname First):*`
  );

  return false;
}

// ═══════════════════════════════════════════════════════
// RETURNING STUDENT
// ═══════════════════════════════════════════════════════

async function handleReturningStudent(
  phone: string, student: Student, conv: Conversation
): Promise<boolean> {
  const todayAttendance = await getTodayAttendance(student.id);

  if (todayAttendance) {
    await sendTextMessage(phone,
      `🎓 *Welcome back, ${student.name}!*\n\n` +
      `✅ Attendance already recorded for today.\n\n` +
      `*Mat No:* ${student.matric_number}\n` +
      `*Department:* ${student.department}\n` +
      `*Level:* ${student.level} Level`
    );
  } else {
    await recordAttendance(student.id);
    await sendTextMessage(phone,
      `🎓 *Welcome back, ${student.name}!*\n\n` +
      `✅ Today's attendance has been recorded.\n\n` +
      `*Mat No:* ${student.matric_number}\n` +
      `*Department:* ${student.department}\n` +
      `*Level:* ${student.level} Level`
    );
  }

  // Transition directly to course-code authentication
  await updateConversation(conv.id, {
    current_module: "LEARNING",
    current_state: "WAITING_COURSE_CODE",
    context_json: { step: "WAITING_COURSE_CODE" },
  });

  await sendTextMessage(phone,
    `Please enter your *Course Code* to continue.\n\n` +
    `_Examples:_ *ELA301*, *ELA302*, or *ELA401*`
  );

  return true;
}

// ═══════════════════════════════════════════════════════
// REGISTRATION STEP PROCESSORS
// ═══════════════════════════════════════════════════════

async function processNameInput(
  phone: string, text: string, contact: Contact, conv: Conversation, ctx: RegCtx
): Promise<boolean> {
  if (isBack(text)) {
    await updateConversation(conv.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });
    await showMainMenu(phone, conv.id);
    return false;
  }

  const name = text.trim();
  if (name.length < 2) {
    await sendTextMessage(phone, "⚠️ Name must be at least 2 characters. Please enter your official full name (Surname First):");
    return false;
  }

  ctx.regName = name;
  ctx.step = "WAITING_MATRIC_NUMBER";
  await updateConversation(conv.id, {
    current_state: "WAITING_MATRIC_NUMBER",
    context_json: ctx as unknown as Record<string, unknown>,
  });

  await sendTextMessage(phone,
    `Thank you, *${name}*.\n\n*Please enter your Matriculation Number:*`
  );
  return false;
}

async function processMatricInput(
  phone: string, text: string, contact: Contact, conv: Conversation, ctx: RegCtx
): Promise<boolean> {
  if (isBack(text)) {
    ctx.step = "WAITING_STUDENT_NAME";
    await updateConversation(conv.id, {
      current_state: "WAITING_STUDENT_NAME",
      context_json: ctx as unknown as Record<string, unknown>,
    });
    await sendTextMessage(phone, "*Please enter your official full name (Surname First):*");
    return false;
  }

  const matric = text.trim();
  if (matric.length === 0) {
    await sendTextMessage(phone, "⚠️ Matriculation number cannot be empty. Please enter your Matriculation Number:");
    return false;
  }

  ctx.regMatric = matric.toUpperCase();
  ctx.step = "WAITING_DEPARTMENT";
  await updateConversation(conv.id, {
    current_state: "WAITING_DEPARTMENT",
    context_json: ctx as unknown as Record<string, unknown>,
  });

  await sendTextMessage(phone, `*Please enter your Department:*`);
  return false;
}

async function processDeptInput(
  phone: string, text: string, contact: Contact, conv: Conversation, ctx: RegCtx
): Promise<boolean> {
  if (isBack(text)) {
    ctx.step = "WAITING_MATRIC_NUMBER";
    await updateConversation(conv.id, {
      current_state: "WAITING_MATRIC_NUMBER",
      context_json: ctx as unknown as Record<string, unknown>,
    });
    await sendTextMessage(phone, "*Please enter your Matriculation Number:*");
    return false;
  }

  const dept = text.trim();
  if (dept.length < 2) {
    await sendTextMessage(phone, "⚠️ Department must be at least 2 characters. Please enter your Department:");
    return false;
  }

  ctx.regDept = dept;
  ctx.step = "WAITING_LEVEL";
  await updateConversation(conv.id, {
    current_state: "WAITING_LEVEL",
    context_json: ctx as unknown as Record<string, unknown>,
  });

  await sendLevelQuestion(phone);
  return false;
}

async function processLevelInput(
  phone: string, text: string, contact: Contact, conv: Conversation, ctx: RegCtx
): Promise<boolean> {
  if (isBack(text)) {
    ctx.step = "WAITING_DEPARTMENT";
    await updateConversation(conv.id, {
      current_state: "WAITING_DEPARTMENT",
      context_json: ctx as unknown as Record<string, unknown>,
    });
    await sendTextMessage(phone, "*Please enter your Department:*");
    return false;
  }

  const level = normalizeLevel(text);
  if (!level) {
    await sendTextMessage(phone,
      "⚠️ Please select a valid level:\n\n1️⃣ 300 Level\n2️⃣ 400 Level"
    );
    return false;
  }

  // Create official student profile
  const student = await createStudentProfile(
    phone,
    ctx.regName || "Student",
    ctx.regMatric || "",
    ctx.regDept || "",
    level
  );

  if (!student) {
    await sendTextMessage(phone, "⚠️ Registration failed. Please try again.");
    await updateConversation(conv.id, { current_module: "MAIN_MENU", current_state: "IDLE", context_json: {} });
    return false;
  }

  // Record daily attendance
  await recordAttendance(student.id);

  // Send formal confirmation
  await sendTextMessage(phone,
    `✅ *REGISTRATION SUCCESSFUL*\n\n` +
    `*Name:* ${student.name}\n` +
    `*Matric No:* ${student.matric_number}\n` +
    `*Department:* ${student.department}\n` +
    `*Level:* ${student.level} Level\n\n` +
    `📅 Today's attendance has also been recorded.\n\n` +
    `Welcome to the *Engr. Ero Learning Centre*!`
  );

  // Transition to course-code authentication
  await updateConversation(conv.id, {
    current_module: "LEARNING",
    current_state: "WAITING_COURSE_CODE",
    context_json: { step: "WAITING_COURSE_CODE" },
  });

  await sendTextMessage(phone,
    `Please enter your *Course Code* to continue.\n\n` +
    `_Examples:_ *ELA301*, *ELA302*, or *ELA401*`
  );

  return true;
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function normalizeLevel(text: string): string | null {
  const n = normalise(text);
  if (n === "1" || n === "300" || n === "300 level" || n === "lvl_300") return "300";
  if (n === "2" || n === "400" || n === "400 level" || n === "lvl_400") return "400";
  return null;
}

async function sendLevelQuestion(phone: string): Promise<void> {
  await sendListMessage(phone,
    "*Please select your Level:*",
    "Select Level",
    [{
      title: "Academic Level",
      rows: [
        makeListRow("lvl_300", "1️⃣ 300 Level", ""),
        makeListRow("lvl_400", "2️⃣ 400 Level", ""),
      ],
    }]
  );
}
