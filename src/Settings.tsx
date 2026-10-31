
import { useEffect, useState } from "react";
import {
  Truck,
  Save,
  RefreshCw,
  ShieldCheck,
  Building2,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { supabase } from "./lib/supabase";

type ShippingSettings = {
  shipping_enabled: boolean;
  shipping_fee: number;
  pod_enabled: boolean;
  require_shipping_payment_before_dispatch: boolean;
};

type Bank = {
  name: string;
  code: string;
  type?: string | null;
};

type PayoutStatus =
  | "NOT_CONFIGURED"
  | "CREATING"
  | "CREATION_REVIEW"
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "INACTIVE";

const initialSettings: ShippingSettings = {
  shipping_enabled: false,
  shipping_fee: 0,
  pod_enabled: false,
  require_shipping_payment_before_dispatch: true
};

const initialPayoutStatus: PayoutStatus = "NOT_CONFIGURED";

export default function Settings({ tenantId }: { tenantId: string }) {
  const [settings, setSettings] = useState<ShippingSettings>(initialSettings);
  const [feeInput, setFeeInput] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountConfirmed, setAccountConfirmed] = useState(false);
  const [payoutStatus, setPayoutStatus] =
    useState<PayoutStatus>(initialPayoutStatus);
  const [payoutLoading, setPayoutLoading] = useState(true);
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [payoutError, setPayoutError] = useState("");
  const [payoutSuccess, setPayoutSuccess] = useState("");
  const [lastFour, setLastFour] = useState("");

  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 20,
    marginBottom: 16
  };

  const fieldStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    maxWidth: 420,
    boxSizing: "border-box",
    padding: 12,
    marginTop: 8,
    border: "1px solid #cbd5e1",
    borderRadius: 9,
    fontSize: 16,
    background: "#fff"
  };

  async function loadSettings() {
    setLoading(true);
    setError("");

    const { data, error: rpcError } = await supabase.rpc(
      "sabi_get_merchant_shipping_settings",
      { p_tenant_id: tenantId }
    );

    if (rpcError) {
      setError(rpcError.message);
    } else if (data) {
      const next = data as ShippingSettings;
      setSettings(next);
      setFeeInput(String(next.shipping_fee ?? 0));
    } else {
      setError("No shipping settings were returned.");
    }

    setLoading(false);
  }

  async function payoutRequest(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke(
      "merchant-paystack",
      { body: { ...body, tenant_id: tenantId } }
    );

    if (error) {
      throw new Error(
        data?.error || error.message || "Payment service request failed."
      );
    }

    if (!data?.success) {
      throw new Error(data?.error || "Unable to complete the request.");
    }

    return data;
  }

  async function loadBanks() {
    try {
      const data = await payoutRequest({ action: "banks" });
      setBanks(data.banks || []);
    } catch (err) {
      setPayoutError(
        err instanceof Error ? err.message : "Unable to load banks."
      );
    }
  }

  async function loadPayoutStatus() {
    setPayoutLoading(true);
    setPayoutError("");

    try {
      const data = await payoutRequest({ action: "status" });

      setPayoutStatus(data.status || "NOT_CONFIGURED");

      if (data.account_last_four) {
        setLastFour(data.account_last_four);
      }

      if (data.account_name) {
        setAccountName(data.account_name);
      }

      setPayoutSuccess("");
    } catch (err) {
      setPayoutError(
        err instanceof Error
          ? err.message
          : "Unable to load payout account status."
      );
    }

    setPayoutLoading(false);
  }

  useEffect(() => {
    if (!tenantId) return;

    loadSettings();
    loadBanks();
    loadPayoutStatus();
  }, [tenantId]);

  function updateShippingEnabled(enabled: boolean) {
    setSettings(current => ({
      ...current,
      shipping_enabled: enabled,
      pod_enabled: enabled && Number(feeInput) > 0
        ? current.pod_enabled
        : false
    }));

    if (!enabled) setFeeInput("0");
  }

  function updateFee(value: string) {
    setFeeInput(value);

    if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
      setSettings(current => ({ ...current, pod_enabled: false }));
    }
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const fee = Number(feeInput);

    if (!Number.isFinite(fee) || fee < 0 || fee > 100000000) {
      setError("Enter a valid delivery fee.");
      return;
    }

    if (
      settings.pod_enabled &&
      (!settings.shipping_enabled || fee <= 0)
    ) {
      setError("Enable shipping and enter a delivery fee first.");
      return;
    }

    setSaving(true);

    const { data, error: rpcError } = await supabase.rpc(
      "sabi_update_merchant_shipping_settings",
      {
        p_tenant_id: tenantId,
        p_shipping_enabled: settings.shipping_enabled,
        p_shipping_fee: settings.shipping_enabled ? fee : 0,
        p_pod_enabled: settings.pod_enabled
      }
    );

    if (rpcError) {
      setError(rpcError.message);
    } else if (data) {
      const next = data as ShippingSettings;
      setSettings(next);
      setFeeInput(String(next.shipping_fee ?? 0));
      setSuccess("Shipping settings saved successfully.");
    } else {
      setError("Unable to confirm saved settings. Please reload.");
    }

    setSaving(false);
  }

  async function resolveBankAccount() {
    setPayoutError("");
    setPayoutSuccess("");
    setAccountName("");
    setAccountConfirmed(false);

    if (!bankCode) {
      setPayoutError("Please select your bank.");
      return;
    }

    if (!/^\d{10}$/.test(accountNumber)) {
      setPayoutError("Enter a valid 10-digit account number.");
      return;
    }

    setPayoutSaving(true);

    try {
      const data = await payoutRequest({
        action: "resolve",
        bank_code: bankCode,
        account_number: accountNumber
      });

      setAccountName(data.account_name || "");
      setPayoutSuccess("Account name verified successfully.");
    } catch (err) {
      setPayoutError(
        err instanceof Error
          ? err.message
          : "Unable to verify this bank account."
      );
    }

    setPayoutSaving(false);
  }

  async function createSubaccount() {
    setPayoutError("");
    setPayoutSuccess("");

    if (!accountName || !accountConfirmed) {
      setPayoutError("Verify and confirm the account name first.");
      return;
    }

    setPayoutSaving(true);

    try {
      const data = await payoutRequest({
        action: "create_subaccount",
        bank_code: bankCode,
        account_number: accountNumber,
        confirmed_account_name: accountName
      });

      setPayoutStatus(data.status || "PENDING_VERIFICATION");
      setLastFour(data.account_last_four || accountNumber.slice(-4));
      setPayoutSuccess(data.message || "Payout account registration submitted.");

      setAccountNumber("");
      setBankCode("");
      setAccountConfirmed(false);

      await loadPayoutStatus();
    } catch (err) {
      setPayoutError(
        err instanceof Error
          ? err.message
          : "Unable to register your payout account."
      );
    }

    setPayoutSaving(false);
  }

  async function refreshPayoutStatus() {
    setPayoutError("");
    setPayoutSuccess("");
    setPayoutSaving(true);

    try {
      const data = await payoutRequest({ action: "status" });

      setPayoutStatus(data.status || "NOT_CONFIGURED");

      if (data.account_last_four) {
        setLastFour(data.account_last_four);
      }

      if (data.account_name) {
        setAccountName(data.account_name);
      }

      setPayoutSuccess("Payout account status refreshed.");
    } catch (err) {
      setPayoutError(
        err instanceof Error
          ? err.message
          : "Unable to refresh payout status."
      );
    }

    setPayoutSaving(false);
  }

  function statusLabel(status: PayoutStatus) {
    const labels: Record<PayoutStatus, string> = {
      NOT_CONFIGURED: "Not configured",
      CREATING: "Registration in progress",
      CREATION_REVIEW: "Requires support review",
      PENDING_VERIFICATION: "Awaiting Paystack verification",
      VERIFIED: "Verified",
      INACTIVE: "Inactive"
    };

    return labels[status] || status;
  }

  const payoutVerified = payoutStatus === "VERIFIED";

  if (loading) {
    return <div style={card}>Loading merchant settings...</div>;
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ ...card, background: "#f8fafc" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Truck size={26} color="#0f766e" />
          <div>
            <h2 style={{ margin: 0 }}>Delivery and payment settings</h2>
            <p style={{ color: "#64748b" }}>
              Manage delivery charges, Pay on Delivery and merchant payouts.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" style={{
          ...card,
          color: "#b91c1c",
          background: "#fef2f2",
          borderColor: "#fecaca"
        }}>
          {error}
        </div>
      )}

      {success && (
        <div role="status" style={{
          ...card,
          color: "#047857",
          background: "#ecfdf5",
          borderColor: "#a7f3d0"
        }}>
          {success}
        </div>
      )}

      <form onSubmit={saveSettings}>
        <div style={card}>
          <label style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start"
          }}>
            <input
              type="checkbox"
              checked={settings.shipping_enabled}
              onChange={e => updateShippingEnabled(e.target.checked)}
            />
            <span>
              <strong>Enable delivery / shipping</strong>
              <small style={{
                display: "block",
                color: "#64748b",
                marginTop: 5
              }}>
                Enable this if you charge customers for delivery.
              </small>
            </span>
          </label>

          {settings.shipping_enabled && (
            <div style={{ marginTop: 20 }}>
              <label htmlFor="delivery-fee">
                <strong>Delivery fee (₦)</strong>
              </label>

              <input
                id="delivery-fee"
                type="number"
                min="0"
                max="100000000"
                step="0.01"
                value={feeInput}
                onChange={e => updateFee(e.target.value)}
                required
                style={fieldStyle}
              />

              <small style={{ color: "#64748b" }}>
                Delivery fees are excluded from Sabi's sales commission.
              </small>
            </div>
          )}
        </div>

        <div style={card}>
          <label style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start"
          }}>
            <input
              type="checkbox"
              checked={settings.pod_enabled}
              disabled={!settings.shipping_enabled || Number(feeInput) <= 0}
              onChange={e => setSettings(current => ({
                ...current,
                pod_enabled: e.target.checked
              }))}
            />
            <span>
              <strong>Allow Pay on Delivery</strong>
              <small style={{
                display: "block",
                color: "#64748b",
                marginTop: 5
              }}>
                Customers pay the delivery fee online first, then pay
                the product amount directly to you when the order arrives.
              </small>
            </span>
          </label>

          {settings.pod_enabled && (
            <div style={{
              display: "flex",
              gap: 9,
              marginTop: 16,
              padding: 12,
              borderRadius: 9,
              background: "#f0fdfa",
              color: "#115e59"
            }}>
              <ShieldCheck size={19} />
              <small>
                Pay on Delivery checkout will collect the applicable
                Sabi commission alongside the delivery payment.
                The merchant's delivery fee remains payable to the merchant.
              </small>
            </div>
          )}

          {(!settings.shipping_enabled || Number(feeInput) <= 0) && (
            <small style={{
              display: "block",
              marginTop: 12,
              color: "#64748b"
            }}>
              Enable delivery and enter a delivery fee to enable Pay on Delivery.
            </small>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
            padding: "12px 20px",
            border: 0,
            borderRadius: 9,
            background: "#0f766e",
            color: "#fff",
            fontWeight: 700,
            cursor: saving ? "wait" : "pointer",
            opacity: saving ? 0.7 : 1
          }}
        >
          {saving ? <RefreshCw size={17} /> : <Save size={17} />}
          {saving ? "Saving..." : "Save settings"}
        </button>
      </form>

      <div style={{ ...card, marginTop: 28 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 18
        }}>
          <Building2 size={26} color="#0f766e" />
          <div>
            <h2 style={{ margin: 0 }}>Merchant payout account</h2>
            <p style={{ color: "#64748b", marginBottom: 0 }}>
              Register the bank account where Paystack will settle your sales.
            </p>
          </div>
        </div>

        <div style={{
          padding: 14,
          borderRadius: 10,
          background: payoutVerified ? "#ecfdf5" : "#f8fafc",
          border: "1px solid #e2e8f0",
          marginBottom: 18
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 9
          }}>
            {payoutVerified
              ? <CheckCircle size={20} color="#047857" />
              : <AlertCircle size={20} color="#64748b" />
            }
            <strong>
              Payout status: {statusLabel(payoutStatus)}
            </strong>
          </div>

          {lastFour && (
            <small style={{
              display: "block",
              marginTop: 7,
              color: "#64748b"
            }}>
              Registered account ending in {lastFour}
            </small>
          )}

          {payoutVerified && (
            <small style={{
              display: "block",
              marginTop: 7,
              color: "#047857"
            }}>
              Your Paystack payout account is verified.
            </small>
          )}
        </div>

        {payoutError && (
          <div role="alert" style={{
            padding: 12,
            marginBottom: 14,
            borderRadius: 9,
            background: "#fef2f2",
            color: "#b91c1c"
          }}>
            {payoutError}
          </div>
        )}

        {payoutSuccess && (
          <div role="status" style={{
            padding: 12,
            marginBottom: 14,
            borderRadius: 9,
            background: "#ecfdf5",
            color: "#047857"
          }}>
            {payoutSuccess}
          </div>
        )}

        {payoutLoading ? (
          <p>Checking payout account...</p>
        ) : payoutVerified ? (
          <p style={{ color: "#047857" }}>
            Your payout account is ready. You do not need to register it again.
          </p>
        ) : payoutStatus === "PENDING_VERIFICATION" ? (
          <p>
            Your account has been submitted to Paystack. Refresh the status
            to check whether verification is complete.
          </p>
        ) : payoutStatus === "CREATING" ||
          payoutStatus === "CREATION_REVIEW" ? (
          <p>
            Registration is in progress or requires support review.
            Do not submit another registration.
          </p>
        ) : payoutStatus === "INACTIVE" ? (
          <p>
            Your Paystack subaccount is inactive. Please contact support
            before attempting another registration.
          </p>
        ) : (
          <>
            <p style={{ color: "#64748b" }}>
              Select your bank and enter the account number belonging
              to your business or settlement account.
            </p>

            <label htmlFor="payout-bank">
              <strong>Bank</strong>
            </label>

            <select
              id="payout-bank"
              value={bankCode}
              onChange={e => {
                setBankCode(e.target.value);
                setAccountName("");
                setAccountConfirmed(false);
                setPayoutSuccess("");
              }}
              style={fieldStyle}
              disabled={payoutSaving}
            >
              <option value="">Select your bank</option>
              {banks.map(bank => (
                <option key={bank.code} value={bank.code}>
                  {bank.name}
                </option>
              ))}
            </select>

            <label
              htmlFor="payout-account-number"
              style={{ display: "block", marginTop: 18 }}
            >
              <strong>Account number</strong>
            </label>

            <input
              id="payout-account-number"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              placeholder="Enter 10-digit account number"
              value={accountNumber}
              onChange={e => {
                setAccountNumber(
                  e.target.value.replace(/\D/g, "").slice(0, 10)
                );
                setAccountName("");
                setAccountConfirmed(false);
                setPayoutSuccess("");
              }}
              style={fieldStyle}
              disabled={payoutSaving}
            />

            <button
              type="button"
              onClick={resolveBankAccount}
              disabled={
                payoutSaving ||
                !bankCode ||
                accountNumber.length !== 10
              }
              style={{
                marginTop: 16,
                padding: "12px 18px",
                border: 0,
                borderRadius: 9,
                background: "#334155",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
                opacity: payoutSaving ? 0.6 : 1
              }}
            >
              {payoutSaving ? "Please wait..." : "Verify bank account"}
            </button>

            {accountName && (
              <div style={{
                marginTop: 18,
                padding: 15,
                borderRadius: 10,
                background: "#f0fdfa",
                border: "1px solid #99f6e4"
              }}>
                <strong>Verified account name</strong>
                <p style={{
                  fontSize: 18,
                  fontWeight: 700,
                  marginBottom: 14
                }}>
                  {accountName}
                </p>

                <label style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start"
                }}>
                  <input
                    type="checkbox"
                    checked={accountConfirmed}
                    onChange={e => setAccountConfirmed(e.target.checked)}
                  />
                  <span>
                    I confirm that this is the correct bank account
                    for receiving my merchant settlements.
                  </span>
                </label>

                <button
                  type="button"
                  onClick={createSubaccount}
                  disabled={!accountConfirmed || payoutSaving}
                  style={{
                    marginTop: 16,
                    padding: "12px 18px",
                    border: 0,
                    borderRadius: 9,
                    background: "#0f766e",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                    opacity: !accountConfirmed || payoutSaving ? 0.6 : 1
                  }}
                >
                  {payoutSaving
                    ? "Registering..."
                    : "Register payout account"}
                </button>
              </div>
            )}
          </>
        )}

        <button
          type="button"
          onClick={refreshPayoutStatus}
          disabled={payoutSaving || payoutLoading}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginTop: 20,
            padding: "10px 15px",
            border: "1px solid #cbd5e1",
            borderRadius: 9,
            background: "#fff",
            color: "#334155",
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          <RefreshCw size={16} />
          Refresh payout status
        </button>
      </div>
    </div>
  );
}
