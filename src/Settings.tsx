
import { useEffect, useState } from "react";
import { Truck, Save, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "./lib/supabase";

type ShippingSettings = {
  shipping_enabled: boolean;
  shipping_fee: number;
  pod_enabled: boolean;
  require_shipping_payment_before_dispatch: boolean;
};

const initialSettings: ShippingSettings = {
  shipping_enabled: false,
  shipping_fee: 0,
  pod_enabled: false,
  require_shipping_payment_before_dispatch: true
};

export default function Settings({ tenantId }: { tenantId: string }) {
  const [settings, setSettings] = useState<ShippingSettings>(initialSettings);
  const [feeInput, setFeeInput] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  useEffect(() => {
    if (tenantId) loadSettings();
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

    if (settings.pod_enabled &&
        (!settings.shipping_enabled || fee <= 0)) {
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

  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 20,
    marginBottom: 16
  };

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
              Manage delivery charges and Pay on Delivery.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" style={{
          ...card, color: "#b91c1c",
          background: "#fef2f2", borderColor: "#fecaca"
        }}>
          {error}
        </div>
      )}

      {success && (
        <div role="status" style={{
          ...card, color: "#047857",
          background: "#ecfdf5", borderColor: "#a7f3d0"
        }}>
          {success}
        </div>
      )}

      <form onSubmit={saveSettings}>
        <div style={card}>
          <label style={{
            display: "flex", gap: 12, alignItems: "flex-start"
          }}>
            <input
              type="checkbox"
              checked={settings.shipping_enabled}
              onChange={e => updateShippingEnabled(e.target.checked)}
            />
            <span>
              <strong>Enable delivery / shipping</strong>
              <small style={{ display: "block", color: "#64748b", marginTop: 5 }}>
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
                style={{
                  display: "block",
                  width: "100%",
                  maxWidth: 320,
                  boxSizing: "border-box",
                  padding: 12,
                  marginTop: 8,
                  border: "1px solid #cbd5e1",
                  borderRadius: 9,
                  fontSize: 16
                }}
              />

              <small style={{ color: "#64748b" }}>
                Delivery fees are excluded from Sabi's sales commission.
              </small>
            </div>
          )}
        </div>

        <div style={card}>
          <label style={{
            display: "flex", gap: 12, alignItems: "flex-start"
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
              <small style={{ display: "block", color: "#64748b", marginTop: 5 }}>
                Customers pay the delivery fee online first, then pay
                the product amount directly to you when the order arrives.
              </small>
            </span>
          </label>

          {settings.pod_enabled && (
            <div style={{
              display: "flex", gap: 9, marginTop: 16,
              padding: 12, borderRadius: 9,
              background: "#f0fdfa", color: "#115e59"
            }}>
              <ShieldCheck size={19} />
              <small>
                Delivery payment must be verified before dispatch.
                Sabi deducts its commission from your wallet after
                verification. Product payment remains due to you on delivery.
              </small>
            </div>
          )}

          {(!settings.shipping_enabled || Number(feeInput) <= 0) && (
            <small style={{ display: "block", marginTop: 12, color: "#64748b" }}>
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
    </div>
  );
}
