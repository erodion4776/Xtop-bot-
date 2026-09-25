// supabase/functions/whatsapp-webhook/paystack.ts

import { safeErrorLog } from "./utils.ts";
import { getSupabaseClient } from "./database.ts";

const PAYSTACK_API_BASE = "https://api.paystack.co";
const supabase = getSupabaseClient();

function getHeaders(): Record<string, string> {
  const token = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!token) throw new Error("Missing PAYSTACK_SECRET_KEY edge secret");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Initializes a 1,000 Naira checkout session with Paystack
 */
export async function initializeExamPayment(
  studentId: string,
  courseId: string,
  courseCode: string,
  phone: string
): Promise<{ paymentUrl: string; reference: string } | null> {
  const reference = `XTOP-CBT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const amountInKobo = 100000; // 1,000 NGN = 100,000 kobo

  try {
    const resp = await fetch(`${PAYSTACK_API_BASE}/transaction/initialize`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        email: `${phone.replace(/\+/g, "")}@xtop.edu.ng`,
        amount: amountInKobo,
        reference,
        callback_url: "https://naijashop.com.ng",
        metadata: {
          student_id: studentId,
          course_id: courseId,
          course_code: courseCode,
          phone
        }
      }),
    });

    const data = await resp.json();
    if (!data.status) {
      safeErrorLog("PaystackInit:Failed", new Error(data.message));
      return null;
    }

    const paymentUrl = data.data.authorization_url;

    // Log the transaction in the database as PENDING
    await supabase.from("payment_transactions").insert({
      student_id: studentId,
      course_id: courseId,
      reference,
      amount: 1000.00,
      status: "PENDING",
      payment_url: paymentUrl
    });

    return { paymentUrl, reference };
  } catch (err) {
    safeErrorLog("initializeExamPayment", err);
    return null;
  }
}

/**
 * Directly verifies a transaction with the Paystack API
 */
export async function verifyExamPayment(reference: string): Promise<boolean> {
  try {
    const resp = await fetch(`${PAYSTACK_API_BASE}/transaction/verify/${reference}`, {
      method: "GET",
      headers: getHeaders(),
    });

    const data = await resp.json();
    if (data.status && data.data.status === "success") {
      // Mark transaction as SUCCESSFUL in database
      await supabase.from("payment_transactions")
        .update({ status: "SUCCESSFUL", updated_at: new Date().toISOString() })
        .eq("reference", reference);

      return true;
    }
    return false;
  } catch (err) {
    safeErrorLog("verifyExamPayment", err);
    return false;
  }
}

/**
 * Checks if a student has an existing successful payment for this course CBT
 */
export async function hasPaidForExam(studentId: string, courseId: string): Promise<boolean> {
  const { data } = await supabase.from("payment_transactions")
    .select("id")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .eq("status", "SUCCESSFUL")
    .limit(1)
    .maybeSingle();

  return !!data;
}
