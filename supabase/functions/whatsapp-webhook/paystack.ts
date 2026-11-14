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

/** Initializes a level-specific CBT checkout session with Paystack. */
export async function initializeExamPayment(
  studentId: string,
  courseId: string,
  courseCode: string,
  phone: string,
  amountNaira: number
): Promise<{ paymentUrl: string; reference: string } | null> {
  if (![500, 1000].includes(amountNaira)) {
    throw new Error("Unsupported CBT fee amount");
  }

  const reference = `XTOP-CBT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const amountInKobo = amountNaira * 100;

  try {
    const resp = await fetch(`${PAYSTACK_API_BASE}/transaction/initialize`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        email: `${phone.replace(/\+/g, "")}@xtop.edu.ng`,
        amount: amountInKobo,
        reference,
        callback_url: "https://xtopbot.netlify.app/cbt-payment-return.html",
        metadata: {
          student_id: studentId,
          course_id: courseId,
          course_code: courseCode,
          phone,
          exam_fee_naira: amountNaira
        }
      }),
    });

    const data = await resp.json();
    if (!data.status) {
      safeErrorLog("PaystackInit:Failed", new Error(data.message));
      return null;
    }

    const paymentUrl = data.data.authorization_url;
    const { error: insertError } = await supabase.from("payment_transactions").insert({
      student_id: studentId,
      course_id: courseId,
      reference,
      amount: amountNaira,
      status: "PENDING",
      payment_url: paymentUrl
    });

    if (insertError) {
      safeErrorLog("PaystackInit:TransactionLogFailed", insertError);
      return null;
    }

    return { paymentUrl, reference };
  } catch (err) {
    safeErrorLog("initializeExamPayment", err);
    return null;
  }
}

/** Verifies both Paystack success and the exact expected CBT fee. */
export async function verifyExamPayment(
  reference: string,
  expectedAmountNaira: number
): Promise<boolean> {
  if (![500, 1000].includes(expectedAmountNaira)) return false;

  try {
    const resp = await fetch(`${PAYSTACK_API_BASE}/transaction/verify/${reference}`, {
      method: "GET",
      headers: getHeaders(),
    });

    const data = await resp.json();
    const expectedKobo = expectedAmountNaira * 100;

    if (
      data.status &&
      data.data.status === "success" &&
      Number(data.data.amount) === expectedKobo &&
      data.data.reference === reference
    ) {
      const { data: updatedPayment, error } = await supabase.from("payment_transactions")
        .update({ status: "SUCCESSFUL", updated_at: new Date().toISOString() })
        .eq("reference", reference)
        .eq("amount", expectedAmountNaira)
        .eq("status", "PENDING")
        .select("id")
        .maybeSingle();

      if (error || !updatedPayment) {
        safeErrorLog("PaystackVerify:TransactionUpdateFailed", error || new Error("No matching pending CBT payment record found"));
        return false;
      }

      return true;
    }

    safeErrorLog("PaystackVerify:AmountMismatch", new Error("Payment unsuccessful or amount/reference mismatch"));
    return false;
  } catch (err) {
    safeErrorLog("verifyExamPayment", err);
    return false;
  }
}

/** Checks whether a student has a successful CBT payment for this course. */
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

// CBT checkout returns to the Learning Centre payment confirmation page.
