// supabase/functions/whatsapp-webhook/modules/attendance.ts
// Phase 4 — Student Registration & Daily Attendance Gate
//
// RESPONSIBILITY BOUNDARY:
// This module handles ONLY:
//   1. Student identification by WhatsApp phone number
//   2. New student registration (name, matric, department, level)
//   3. Daily attendance recording
//   4. Handoff to WAITING_COURSE_CODE (learning.ts takes over from there)
//
// This module does NOT handle:
//   Course authentication, lessons, materials, progress, exams, results.

import {
  Contact, Conversation, updateConversation,
  Student,
  getStudentByPhone, createStudentProfile, updateStudentProfile,
  recordAttendance, getTodayAttendance, isStudentProfileComplete,
} from "../database.ts";
import {
  sendListMessage, sendTextMessage,
  makeListRow,
} from "../whatsapp.ts";
import { normalise, isBack, isExit, isGreeting } from "../utils.ts";
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
// MAIN HANDLER
// ═══════════════════════════════════════════════════════

/**
 * Called by learning.ts when the student enters the Learning Centre.
 * Returns true if registration/attendance is complete and learning.ts
 * should continue to course-code authentication.
 * Returns false if the student is still in the registration flow.
 */
export async function handleRegistration(
  phone: string, text: string, contact: Contact, conv: Conversation
): Promise<boolean> {
  const n = normalise(text);
  const state = conv.current_state;
  const ctx = (conv.context_json || {}) as RegCtx;

  // ── Global interrupts during registration ──
  if (isExit(text) || n === "exit" || n === "cancel") {
    await updateConversation(conv.id, {
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    });
    await sendTextMessage(
      phone,
      "👋 You have exited the *Engr. Ero Learning Centre*.\n\nType *menu* to return."
    );
    return false;
  }

  if (isGreeting(text) && state !== "ENTRY") {
    await updateConversation(conv.id, {
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    });
    await showMainMenu(phone, conv.id);
    return false;
  }

  // ── State dispatcher ──
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

// ═══════════════════════════════════════════════════════
// STEP 1: CHECK STUDENT BY PHONE
// ═══════════════════════════════════════════════════════

async function checkStudentAndRoute(
  phone: string, contact: Contact, conv: Conversation
): Promise<boolean> {
  let student: Student | null = null;

  try {
    student = await getStudentByPhone(phone);
  } catch (err) {
    await sendTextMessage(
      phone,
      "⚠️ We could not verify your student record. Please try again later or type *menu* to exit."
    );
    return false;
  }

  // ── RETURNING STUDENT: profile is complete ──
  if (student && isStudentProfileComplete(student)) {
    return await handleReturningStudent(phone, student, conv);
  }

  // ── EXISTING BUT INCOMPLETE: resume from missing field ──
  if (student && !isStudentProfileComplete(student)) {
    return await resumeIncompleteRegistration(phone, student, conv);
  }

  // ── NEW STUDENT: start registration from scratch ──
  await updateConversation(conv.id, {
    current_module: "LEARNING",
    current_state: "WAITING_STUDENT_NAME",
    context_json: { step: "WAITING_STUDENT_NAME" },
  });

  await sendTextMessage(
    phone,
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
  let attendanceRecorded = false;
  let attendanceAlreadyExists = false;

  try {
    const todayAttendance = await getTodayAttendance(student.id);

    if (todayAttendance) {
      attendanceAlreadyExists = true;
    } else {
      const result = await recordAttendance(student.id);
      if (result) {
        attendanceRecorded = true;
      }
    }
  } catch (err) {
    // Attendance failure should not block the student from entering
    // but we must NOT claim success
    attendanceRecorded = false;
    attendanceAlreadyExists = false;
  }

  // Build attendance message
  let attendanceLine = "";
  if (attendanceAlreadyExists) {
    attendanceLine = "✅ Attendance already recorded for today.";
  } else if (attendanceRecorded) {
    attendanceLine = "✅ Today's attendance has been recorded.";
  } else {
    attendanceLine = "⚠️ Could not record today's attendance. Please inform your lecturer.";
  }

  await sendTextMessage(
    phone,
    `🎓 *Welcome back, ${student.name}!*\n\n` +
    `${attendanceLine}\n\n` +
    `*Mat No:* ${student.matric_number}\n` +
    `*Department:* ${student.department}\n` +
    `*Level:* ${student.level} Level`
  );

  // Handoff to course-code authentication in learning.ts
  await transitionToCourseCode(phone, conv);
  return true;
}

// ═══════════════════════════════════════════════════════
// INCOMPLETE REGISTRATION RESUMPTION
// ═══════════════════════════════════════════════════════

async function resumeIncompleteRegistration(
  phone: string, student: Student, conv: Conversation
): Promise<boolean> {
  const ctx: RegCtx = { step: "" };

  // Check each field in order and resume from the first missing one
  if (!student.name || student.name.trim().length < 2) {
    ctx.step = "WAITING_STUDENT_NAME";
    await updateConversation(conv.id, {
      current_state: "WAITING_STUDENT_NAME",
      context_json: ctx as unknown as Record<string, unknown>,
    });
    await sendTextMessage(
      phone,
      `🎓 *ENGR. ERO LEARNING CENTRE*\n\n` +
      `Your profile is incomplete.\n\n*Please enter your official full name (Surname First):*`
    );
    return false;
  }

  ctx.regName = student.name;

  if (!student.matric_number || student.matric_number.trim().length === 0) {
    ctx.step = "WAITING_MATRIC_NUMBER";
    await updateConversation(conv.id, {
      current_state: "WAITING_MATRIC_NUMBER",
      context_json: ctx as unknown as Record<string, unknown>,
    });
    await sendTextMessage(
      phone,
      `Thank you, *${student.name}*.\n\n*Please enter your Matriculation Number:*`
    );
    return false;
  }

  ctx.regMatric = student.matric_number;

  if (!student.department || student.department.trim().length < 2) {
    ctx.step = "WAITING_DEPARTMENT";
    await updateConversation(conv.id, {
      current_state: "WAITING_DEPARTMENT",
      context_json: ctx as unknown as Record<string, unknown>,
    });
    await sendTextMessage(phone, `*Please enter your Department:*`);
    return false;
  }

  ctx.regDept = student.department;

  if (!student.level || (student.level !== "300" && student.level !== "400")) {
    ctx.step = "WAITING_LEVEL";
    await updateConversation(conv.id, {
      current_state: "WAITING_LEVEL",
      context_json: ctx as unknown as Record<string, unknown>,
    });
    await sendLevelQuestion(phone);
    return false;
  }

  // All fields are actually complete — treat as returning student
  return await handleReturningStudent(phone, student, conv);
}

// ═══════════════════════════════════════════════════════
// REGISTRATION STEP: NAME
// ═══════════════════════════════════════════════════════

async function processNameInput(
  phone: string, text: string, contact: Contact, conv: Conversation, ctx: RegCtx
): Promise<boolean> {
  if (isBack(text)) {
    await updateConversation(conv.id, {
      current_module: "MAIN_MENU",
      current_state: "IDLE",
      context_json: {},
    });
    await showMainMenu(phone, conv.id);
    return false;
  }

  const name = text.trim();
  if (name.length < 2) {
    await sendTextMessage(
      phone,
      "⚠️ Name must be at least 2 characters.\n\n*Please enter your official full name (Surname First):*"
    );
    return false;
  }

  ctx.regName = name;
  ctx.step = "WAITING_MATRIC_NUMBER";
  await updateConversation(conv.id, {
    current_state: "WAITING_MATRIC_NUMBER",
    context_json: ctx as unknown as Record<string, unknown>,
  });

  await sendTextMessage(
    phone,
    `Thank you, *${name}*.\n\n*Please enter your Matriculation Number:*`
  );
  return false;
}

// ═══════════════════════════════════════════════════════
// REGISTRATION STEP: MATRIC NUMBER
// ═══════════════════════════════════════════════════════

async function processMatricInput(
  phone: string, text: string, contact: Contact, conv: Conversation, ctx: RegCtx
): Promise<boolean> {
  if (isBack(text)) {
    ctx.step = "WAITING_STUDENT_NAME";
    ctx.regMatric = undefined;
    await updateConversation(conv.id, {
      current_state: "WAITING_STUDENT_NAME",
      context_json: ctx as unknown as Record<string, unknown>,
    });
    await sendTextMessage(
      phone,
      "*Please enter your official full name (Surname First):*"
    );
    return false;
  }

  const matric = text.trim();
  if (matric.length === 0) {
    await sendTextMessage(
      phone,
      "⚠️ Matriculation number cannot be empty.\n\n*Please enter your Matriculation Number:*"
    );
    return false;
  }

  // Store uppercase, no regex validation
  ctx.regMatric = matric.toUpperCase();
  ctx.step = "WAITING_DEPARTMENT";
  await updateConversation(conv.id, {
    current_state: "WAITING_DEPARTMENT",
    context_json: ctx as unknown as Record<string, unknown>,
  });

  await sendTextMessage(phone, `*Please enter your Department:*`);
  return false;
}

// ═══════════════════════════════════════════════════════
// REGISTRATION STEP: DEPARTMENT
// ═══════════════════════════════════════════════════════

async function processDeptInput(
  phone: string, text: string, contact: Contact, conv: Conversation, ctx: RegCtx
): Promise<boolean> {
  if (isBack(text)) {
    ctx.step = "WAITING_MATRIC_NUMBER";
    ctx.regDept = undefined;
    await updateConversation(conv.id, {
      current_state: "WAITING_MATRIC_NUMBER",
      context_json: ctx as unknown as Record<string, unknown>,
    });
    await sendTextMessage(phone, `*Please enter your Matriculation Number:*`);
    return false;
  }

  const dept = text.trim();
  if (dept.length < 2) {
    await sendTextMessage(
      phone,
      "⚠️ Department must be at least 2 characters.\n\n*Please enter your Department:*"
    );
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

// ═══════════════════════════════════════════════════════
// REGISTRATION STEP: LEVEL
// ═══════════════════════════════════════════════════════

async function processLevelInput(
  phone: string, text: string, contact: Contact, conv: Conversation, ctx: RegCtx
): Promise<boolean> {
  if (isBack(text)) {
    ctx.step = "WAITING_DEPARTMENT";
    await updateConversation(conv.id, {
      current_state: "WAITING_DEPARTMENT",
      context_json: ctx as unknown as Record<string, unknown>,
    });
    await sendTextMessage(phone, `*Please enter your Department:*`);
    return false;
  }

  const level = normalizeLevel(text);
  if (!level) {
    await sendTextMessage(
      phone,
      "⚠️ Invalid selection.\n\n*Please select a valid level:*\n\n1️⃣ 300 Level\n2️⃣ 400 Level"
    );
    return false;
  }

  // ── DUPLICATE PROTECTION ──
  // Check if a student already exists for this phone before creating
  let student: Student | null = null;
  try {
    student = await getStudentByPhone(phone);
  } catch {
    // Ignore lookup errors — proceed to create
  }

  if (student && isStudentProfileComplete(student)) {
    // Student was already fully registered (race condition or concurrent session)
    // Just handle as returning student
    return await handleReturningStudent(phone, student, conv);
  }

  if (student && !isStudentProfileComplete(student)) {
    // Existing incomplete profile — update it instead of creating a duplicate
    try {
      const updated = await updateStudentProfile(student.id, {
        name: ctx.regName || undefined,
        matric_number: ctx.regMatric || undefined,
        department: ctx.regDept || undefined,
        level: level,
      });

      if (!updated) {
        await sendTextMessage(
          phone,
          "⚠️ Registration could not be completed. Please try again by typing *menu* and re-entering the Learning Centre."
        );
        await updateConversation(conv.id, {
          current_module: "MAIN_MENU",
          current_state: "IDLE",
          context_json: {},
        });
        return false;
      }

      student = updated;
    } catch {
      await sendTextMessage(
        phone,
        "⚠️ Registration could not be completed. Please try again later."
      );
      await updateConversation(conv.id, {
        current_module: "MAIN_MENU",
        current_state: "IDLE",
        context_json: {},
      });
      return false;
    }
  } else {
    // No existing student — create new profile
    try {
      student = await createStudentProfile(
        phone,
        ctx.regName || "Student",
        ctx.regMatric || "",
        ctx.regDept || "",
        level
      );

      if (!student) {
        await sendTextMessage(
          phone,
          "⚠️ Registration could not be completed. Please try again by typing *menu* and re-entering the Learning Centre."
        );
        await updateConversation(conv.id, {
          current_module: "MAIN_MENU",
          current_state: "IDLE",
          context_json: {},
        });
        return false;
      }
    } catch {
      await sendTextMessage(
        phone,
        "⚠️ Registration could not be completed. Please try again later."
      );
      await updateConversation(conv.id, {
        current_module: "MAIN_MENU",
        current_state: "IDLE",
        context_json: {},
      });
      return false;
    }
  }

  // ── RECORD ATTENDANCE ──
  let attendanceSuccess = false;
  try {
    const existing = await getTodayAttendance(student.id);
    if (existing) {
      attendanceSuccess = true; // Already recorded
    } else {
      const result = await recordAttendance(student.id);
      attendanceSuccess = !!result;
    }
  } catch {
    attendanceSuccess = false;
  }

  // ── SEND CONFIRMATION ──
  const attendanceLine = attendanceSuccess
    ? "📅 Today's attendance has also been recorded."
    : "⚠️ Could not record today's attendance. Please inform your lecturer.";

  await sendTextMessage(
    phone,
    `✅ *REGISTRATION SUCCESSFUL*\n\n` +
    `*Name:* ${student.name}\n` +
    `*Matric No:* ${student.matric_number}\n` +
    `*Department:* ${student.department}\n` +
    `*Level:* ${student.level} Level\n\n` +
    `${attendanceLine}\n\n` +
    `Welcome to the *Engr. Ero Learning Centre*!`
  );

  // ── HANDOFF TO COURSE-CODE AUTHENTICATION ──
  await transitionToCourseCode(phone, conv);
  return true;
}

// ═══════════════════════════════════════════════════════
// HANDOFF HELPER
// ═══════════════════════════════════════════════════════

/**
 * Transitions the conversation to WAITING_COURSE_CODE.
 * From this point, learning.ts takes over for course authentication.
 */
async function transitionToCourseCode(
  phone: string, conv: Conversation
): Promise<void> {
  await updateConversation(conv.id, {
    current_module: "LEARNING",
    current_state: "WAITING_COURSE_CODE",
    context_json: { step: "WAITING_COURSE_CODE" },
  });

  await sendTextMessage(
    phone,
    `Please enter your *Course Code* to continue.\n\n` +
    `_Examples:_ *ELA301*, *ELA302*, or *ELA401*`
  );
}

// ═══════════════════════════════════════════════════════
// LEVEL NORMALIZATION
// ═══════════════════════════════════════════════════════

function normalizeLevel(text: string): string | null {
  const n = normalise(text);
  if (n === "1" || n === "300" || n === "300 level" || n === "lvl_300") return "300";
  if (n === "2" || n === "400" || n === "400 level" || n === "lvl_400") return "400";
  return null;
}

// ═══════════════════════════════════════════════════════
// LEVEL QUESTION
// ═══════════════════════════════════════════════════════

async function sendLevelQuestion(phone: string): Promise<void> {
  await sendListMessage(
    phone,
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
