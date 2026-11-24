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

/** Initializes the standard ₦1,000 CBT checkout session with Paystack. */
export async function initializeExamPayment(
  studentId: string,
  courseId: string,
  courseCode: string,
  phone: string,
  amountNaira: number
): Promise<{ paymentUrl: string; reference: string } | null> {
  if (amountNaira !== 1000) {
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

/** Verifies Paystack success, NGN currency, exact CBT fee and a matching local record. */
export async function verifyExamPayment(
  reference: string,
  expectedAmountNaira: number
): Promise<boolean> {
  if (!reference || expectedAmountNaira !== 1000) return false;

  try {
    const resp = await fetch(`${PAYSTACK_API_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: getHeaders(),
    });

    if (!resp.ok) {
      safeErrorLog("PaystackVerify:HttpFailure", new Error(`Paystack verification returned HTTP ${resp.status}`));
      return false;
    }

    const data = await resp.json();
    const expectedKobo = expectedAmountNaira * 100;
    const verified = Boolean(
      data.status &&
      data.data?.status === "success" &&
      String(data.data?.currency || "").toUpperCase() === "NGN" &&
      Number(data.data?.amount) === expectedKobo &&
      data.data?.reference === reference
    );

    if (!verified) {
      safeErrorLog("PaystackVerify:AmountMismatch", new Error("Payment unsuccessful or amount, currency or reference mismatch"));
      return false;
    }

    // Read by the unique reference first. This avoids treating a harmless
    // concurrent webhook update as a missing payment and makes the expected
    // amount/status checks explicit before changing the row.
    const { data: existing, error: lookupError } = await supabase
      .from("payment_transactions")
      .select("id,amount,status")
      .eq("reference", reference)
      .maybeSingle();

    if (lookupError || !existing || Number(existing.amount) !== expectedAmountNaira) {
      safeErrorLog("PaystackVerify:LocalRecordMismatch", lookupError || new Error("No local CBT payment with the expected amount and reference"));
      return false;
    }

    if (existing.status === "SUCCESSFUL") return true;
    if (existing.status !== "PENDING") {
      safeErrorLog("PaystackVerify:UnexpectedLocalStatus", new Error("The local CBT payment is not pending or successful"));
      return false;
    }

    const { data: updated, error: updateError } = await supabase
      .from("payment_transactions")
      .update({ status: "SUCCESSFUL", updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("status", "PENDING")
      .select("id")
      .maybeSingle();

    if (updateError) {
      safeErrorLog("PaystackVerify:TransactionUpdateFailed", updateError);
      return false;
    }
    if (updated) return true;

    // A webhook may have changed PENDING to SUCCESSFUL between the read and
    // update. Re-read once and accept only that exact successful state.
    const { data: confirmed, error: confirmError } = await supabase
      .from("payment_transactions")
      .select("status,amount")
      .eq("id", existing.id)
      .maybeSingle();

    if (!confirmError && confirmed?.status === "SUCCESSFUL" && Number(confirmed.amount) === expectedAmountNaira) {
      return true;
    }

    safeErrorLog("PaystackVerify:TransactionUpdateFailed", confirmError || new Error("Payment row did not reach SUCCESSFUL state"));
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
