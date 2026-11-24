
import { useEffect, useState } from "react";
import {
  Truck,
  Save,
  RefreshCw,
  ShieldCheck,
  Building2,
  CheckCircle,
  AlertCircle,
  MessageCircle
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
  const [businessName, setBusinessName] = useState("");
  const [businessNameLoading, setBusinessNameLoading] = useState(true);
  const [businessNameSaving, setBusinessNameSaving] = useState(false);
  const [businessNameError, setBusinessNameError] = useState("");
  const [businessNameSuccess, setBusinessNameSuccess] = useState("");
  const [businessLogoUrl, setBusinessLogoUrl] = useState("");
  const [businessLogoBusy, setBusinessLogoBusy] = useState(false);
  const [businessLogoError, setBusinessLogoError] = useState("");
  const [businessLogoSuccess, setBusinessLogoSuccess] = useState("");
  const [whatsappPhotoBusy, setWhatsappPhotoBusy] = useState(false);
  const [whatsappPhotoError, setWhatsappPhotoError] = useState("");
  const [whatsappPhotoSuccess, setWhatsappPhotoSuccess] = useState("");

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
  const [whatsappLoading, setWhatsappLoading] = useState(true);
  const [whatsappConnecting, setWhatsappConnecting] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappVerifiedName, setWhatsappVerifiedName] = useState("");
  const [whatsappError, setWhatsappError] = useState("");
  const [whatsappPin, setWhatsappPin] = useState("");
  const [whatsappRegistering, setWhatsappRegistering] = useState(false);
  const [whatsappRegistrationSuccess, setWhatsappRegistrationSuccess] = useState("");
  const [marketplacePublished, setMarketplacePublished] = useState(false);
  const [marketplaceLoading, setMarketplaceLoading] = useState(true);
  const [marketplaceSaving, setMarketplaceSaving] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState("");
  const [marketplaceSuccess, setMarketplaceSuccess] = useState("");
  const [deliverySettings, setDeliverySettings] = useState<any>({ pickup_address: "", pickup_state: "", pickup_city: "", pickup_lga: "", pickup_phone: "", base_fee: 0, per_km_fee: 0, minimum_fee: 0, max_delivery_km: 100, pricing_enabled: false, geocoded_label: null, location_verified_at: null });
  const [deliveryConfigured, setDeliveryConfigured] = useState(false);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [deliverySuccess, setDeliverySuccess] = useState("");

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

  async function loadBusinessProfile() {
    setBusinessNameLoading(true);
    setBusinessNameError("");
    const { data, error } = await supabase.functions.invoke(
      "xtop-dashboard?action=merchant-profile",
      { method: "GET" }
    );
    if (error || data?.error) {
      setBusinessNameError(data?.error || error?.message || "Unable to load business profile.");
    } else {
      setBusinessName(data?.business_name || "");
      setBusinessLogoUrl(data?.logo_url || "");
    }
    setBusinessNameLoading(false);
  }

  async function saveBusinessProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusinessNameError("");
    setBusinessNameSuccess("");
    const cleanName = businessName.trim();
    if (!cleanName || cleanName.length > 80) {
      setBusinessNameError("Enter a business name between 1 and 80 characters.");
      return;
    }
    setBusinessNameSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "xtop-dashboard?action=merchant-profile",
        { body: { business_name: cleanName } }
      );
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "Unable to save business name.");
      }
      setBusinessName(data.business_name || cleanName);
      setBusinessNameSuccess("Business name saved. New WhatsApp greetings will use this name.");
    } catch (err) {
      setBusinessNameError(err instanceof Error ? err.message : "Unable to save business name.");
    } finally {
      setBusinessNameSaving(false);
    }
  }

  async function saveBusinessLogoUrl(logoUrl: string | null) {
    const { data, error } = await supabase.functions.invoke(
      "xtop-dashboard?action=merchant-profile",
      { body: { logo_url: logoUrl } }
    );
    if (error || !data?.success) {
      throw new Error(data?.error || error?.message || "Unable to save business image.");
    }
    setBusinessLogoUrl(data.logo_url || "");
  }

  async function updateWhatsAppProfilePhoto() {
    setWhatsappPhotoError("");
    setWhatsappPhotoSuccess("");
    if (!businessLogoUrl) {
      setWhatsappPhotoError("Upload and save a JPG or PNG business logo first.");
      return;
    }
    setWhatsappPhotoBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "xtop-dashboard?action=whatsapp-profile-picture",
        { body: {} }
      );
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "Unable to update WhatsApp profile photo.");
      }
      setWhatsappPhotoSuccess(data.message || "WhatsApp profile photo updated successfully.");
    } catch (err) {
      setWhatsappPhotoError(err instanceof Error ? err.message : "Unable to update WhatsApp profile photo.");
    } finally {
      setWhatsappPhotoBusy(false);
    }
  }

  async function uploadBusinessLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setBusinessLogoError("");
    setBusinessLogoSuccess("");
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setBusinessLogoError("Choose a JPG or PNG image. WhatsApp profile photos do not support WEBP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setBusinessLogoError("Business image must be 2 MB or smaller.");
      return;
    }
    setBusinessLogoBusy(true);
    try {
      const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
      const path = `${tenantId}/business-logo/logo.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("sabi-product-images")
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("sabi-product-images").getPublicUrl(path);
      await saveBusinessLogoUrl(data.publicUrl);
      setBusinessLogoSuccess("Business image saved. Updating the official WhatsApp profile photo...");
      await updateWhatsAppProfilePhoto();
    } catch (err) {
      setBusinessLogoError(err instanceof Error ? err.message : "Unable to upload business image.");
    } finally {
      setBusinessLogoBusy(false);
    }
  }

  async function removeBusinessLogo() {
    if (!businessLogoUrl) return;
    setBusinessLogoBusy(true);
    setBusinessLogoError("");
    setBusinessLogoSuccess("");
    try {
      const marker = "/storage/v1/object/public/sabi-product-images/";
      const path = businessLogoUrl.includes(marker) ? businessLogoUrl.split(marker)[1] : "";
      if (path && path.startsWith(`${tenantId}/business-logo/`)) {
        const { error } = await supabase.storage.from("sabi-product-images").remove([path]);
        if (error) throw error;
      }
      await saveBusinessLogoUrl(null);
      setBusinessLogoSuccess("Business image removed.");
    } catch (err) {
      setBusinessLogoError(err instanceof Error ? err.message : "Unable to remove business image.");
    } finally {
      setBusinessLogoBusy(false);
    }
  }

  async function loadMarketplaceStatus() {
    setMarketplaceLoading(true);
    setMarketplaceError("");
    const { data, error } = await supabase.rpc("sabi_get_merchant_marketplace_status", { p_tenant_id: tenantId });
    if (error) {
      setMarketplaceError("Unable to load Sabi Discover settings: " + error.message);
    } else {
      const result = Array.isArray(data) ? data[0] : data;
      setMarketplacePublished(result?.is_published === true);
    }
    setMarketplaceLoading(false);
  }

  async function saveMarketplaceVisibility(enabled: boolean) {
    setMarketplaceSaving(true);
    setMarketplaceError("");
    setMarketplaceSuccess("");
    const { data, error } = await supabase.rpc("sabi_set_merchant_marketplace_visibility", { p_tenant_id: tenantId, p_is_published: enabled });
    if (error) {
      setMarketplaceError(error.message);
    } else {
      const result = Array.isArray(data) ? data[0] : data;
      setMarketplacePublished(result?.is_published === true);
      setMarketplaceSuccess(enabled ? "Your store is now visible on Sabi Discover." : "Your store has been hidden from Sabi Discover.");
    }
    setMarketplaceSaving(false);
  }

  async function loadDeliverySettings() {
    setDeliveryLoading(true); setDeliveryError("");
    const { data, error } = await supabase.functions.invoke("sabi-delivery", { body: { action: "settings-get", tenant_id: tenantId } });
    if (error || !data?.success) {
      setDeliveryError(data?.error || error?.message || "Unable to load delivery settings.");
    } else {
      setDeliverySettings(data.settings || {});
      setDeliveryConfigured(data.configured === true);
    }
    setDeliveryLoading(false);
  }

  async function saveDeliverySettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeliverySaving(true); setDeliveryError(""); setDeliverySuccess("");
    if (deliverySettings.pricing_enabled === true && (!deliverySettings.pickup_address?.trim() || !deliverySettings.pickup_city?.trim() || !deliverySettings.pickup_state?.trim())) {
      setDeliveryError("Enter your pickup street address, city and state.");
      setDeliverySaving(false); return;
    }
    const pricing = [deliverySettings.base_fee, deliverySettings.per_km_fee, deliverySettings.minimum_fee].map(Number);
    if (pricing.some(value => !Number.isFinite(value) || value < 0 || value > 100000000) ||
        !Number.isFinite(Number(deliverySettings.max_delivery_km)) || Number(deliverySettings.max_delivery_km) <= 0) {
      setDeliveryError("Check your delivery charges and maximum delivery distance.");
      setDeliverySaving(false); return;
    }
    const { data, error } = await supabase.functions.invoke("sabi-delivery", {
      body: { action: "settings-save", tenant_id: tenantId, ...deliverySettings }
    });
    if (error || !data?.success) setDeliveryError(data?.error || error?.message || "Unable to save delivery settings.");
    else { setDeliverySettings(data.settings); setDeliverySuccess(data.message || "Pickup location verified and delivery pricing saved."); }
    setDeliverySaving(false);
  }

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

  async function loadWhatsAppStatus() {
    setWhatsappLoading(true);
    setWhatsappError("");
    const { data, error } = await supabase.functions.invoke(
      "xtop-dashboard?action=whatsapp-status",
      { body: {} }
    );
    if (error || data?.error) {
      setWhatsappError(data?.error || error?.message || "Unable to check WhatsApp status.");
      setWhatsappConnected(false);
    } else {
      setWhatsappConnected(data?.connected === true);
      setWhatsappPhone(data?.phone || "");
      setWhatsappVerifiedName(data?.verified_name || "");
    }
    setWhatsappLoading(false);
  }

  async function registerWhatsAppNumber() {
    setWhatsappError("");
    setWhatsappRegistrationSuccess("");
    if (!/^\d{6}$/.test(whatsappPin)) {
      setWhatsappError("Enter a six-digit PIN.");
      return;
    }
    setWhatsappRegistering(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "xtop-dashboard?action=whatsapp-register",
        { body: { pin: whatsappPin } }
      );
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "Meta could not register this number.");
      }
      setWhatsappRegistrationSuccess(data.message || "WhatsApp number registered successfully.");
      setWhatsappPin("");
    } catch (err) {
      setWhatsappError(err instanceof Error ? err.message : "WhatsApp registration failed.");
    } finally {
      setWhatsappRegistering(false);
    }
  }

  async function connectWhatsApp() {
    setWhatsappError("");
    setWhatsappConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "xtop-dashboard?action=whatsapp-connect",
        { body: {} }
      );
      if (error || !data?.success || !data?.connect_url) {
        throw new Error(data?.error || error?.message || "Could not start WhatsApp registration.");
      }
      window.location.assign(data.connect_url);
    } catch (err) {
      setWhatsappError(err instanceof Error ? err.message : "Could not start WhatsApp registration.");
      setWhatsappConnecting(false);
    }
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

    loadBusinessProfile();
    loadSettings();
    loadMarketplaceStatus();
    loadDeliverySettings();
    loadWhatsAppStatus();
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
      <form onSubmit={saveBusinessProfile} style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Building2 size={25} color="#0f766e" />
          <div>
            <h2 style={{ margin: 0 }}>Business profile</h2>
            <p style={{ color: "#64748b", margin: "5px 0 0" }}>Edit the name customers see in your WhatsApp shop.</p>
          </div>
        </div>
        {businessNameError && <div role="alert" style={{ padding: 10, marginBottom: 12, borderRadius: 8, background: "#fef2f2", color: "#b91c1c" }}>{businessNameError}</div>}
        {businessNameSuccess && <div role="status" style={{ padding: 10, marginBottom: 12, borderRadius: 8, background: "#ecfdf5", color: "#047857" }}>{businessNameSuccess}</div>}
        <label htmlFor="merchant-business-name"><strong>Business name</strong></label>
        <input
          id="merchant-business-name"
          type="text"
          maxLength={80}
          value={businessName}
          onChange={event => setBusinessName(event.target.value)}
          placeholder={businessNameLoading ? "Loading business name..." : "Enter your business name"}
          disabled={businessNameLoading || businessNameSaving}
          required
          style={fieldStyle}
        />
        <small style={{ display: "block", color: "#64748b", marginTop: 6 }}>
          This changes the customer-facing shop name, not your WhatsApp verified name or legal workspace identity.
        </small>
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #e2e8f0" }}>
          <strong>Business image / logo</strong>
          <p style={{ color: "#64748b", margin: "5px 0 12px" }}>Upload your shop logo or business photo. JPG, PNG or WEBP; maximum 2 MB.</p>
          {businessLogoUrl && <img src={businessLogoUrl} alt="Business logo preview" style={{ width: 112, height: 112, objectFit: "contain", border: "1px solid #e2e8f0", borderRadius: 12, padding: 6, display: "block", marginBottom: 12, background: "#fff" }} />}
          {businessLogoError && <div role="alert" style={{ color: "#b91c1c", marginBottom: 10 }}>{businessLogoError}</div>}
          {businessLogoSuccess && <div role="status" style={{ color: "#047857", marginBottom: 10 }}>{businessLogoSuccess}</div>}
          {whatsappPhotoError && <div role="alert" style={{ color: "#b91c1c", marginBottom: 10 }}>{whatsappPhotoError}</div>}
          {whatsappPhotoSuccess && <div role="status" style={{ color: "#047857", marginBottom: 10 }}>{whatsappPhotoSuccess}</div>}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadBusinessLogo} disabled={businessLogoBusy || businessNameLoading} style={{ ...fieldStyle, maxWidth: 420 }} />
          {businessLogoUrl && <button type="button" onClick={removeBusinessLogo} disabled={businessLogoBusy} style={{ marginTop: 10, marginRight: 10, padding: "10px 14px", border: "1px solid #dc2626", borderRadius: 9, color: "#b91c1c", background: "#fff" }}>Remove image</button>}
          {businessLogoBusy && <span style={{ marginLeft: 8, color: "#64748b" }}>Saving image...</span>}
          {businessLogoUrl && <button type="button" onClick={updateWhatsAppProfilePhoto} disabled={businessLogoBusy || whatsappPhotoBusy} style={{ display: "block", marginTop: 12, padding: "10px 14px", border: 0, borderRadius: 9, background: "#0f766e", color: "#fff", fontWeight: 700 }}>
            {whatsappPhotoBusy ? "Updating WhatsApp photo..." : "Update WhatsApp profile photo"}
          </button>}
          <small style={{ display: "block", color: "#64748b", marginTop: 8 }}>This updates the official photo on the connected WhatsApp number. JPG and PNG are supported; Meta may take a short time to display the change.</small>
        </div>
        <button type="submit" disabled={businessNameLoading || businessNameSaving} style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 14, padding: "11px 18px", border: 0, borderRadius: 9, background: "#0f766e", color: "#fff", fontWeight: 700, opacity: businessNameSaving ? 0.7 : 1 }}>
          {businessNameSaving ? <RefreshCw size={17} /> : <Save size={17} />}
          {businessNameSaving ? "Saving..." : "Save business name"}
        </button>
      </form>
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Building2 size={25} color="#0f766e" />
          <div><h2 style={{ margin: 0 }}>Sabi Discover marketplace</h2><p style={{ color: "#64748b", margin: "5px 0 0" }}>Choose whether customers can discover your store and eligible products on the public Sabi marketplace.</p></div>
        </div>
        {marketplaceError && <div role="alert" style={{ color: "#b91c1c", marginBottom: 10 }}>{marketplaceError}</div>}
        {marketplaceSuccess && <div role="status" style={{ color: "#047857", marginBottom: 10 }}>{marketplaceSuccess}</div>}
        <label style={{ display: "flex", alignItems: "flex-start", gap: 11, cursor: "pointer" }}>
          <input type="checkbox" checked={marketplacePublished} disabled={marketplaceLoading || marketplaceSaving} onChange={e => saveMarketplaceVisibility(e.target.checked)} />
          <span><strong>Show my store on Sabi Discover</strong><small style={{ display: "block", color: "#64748b", marginTop: 5 }}>When enabled, active products with available stock can appear in public search and category browsing. You can turn this off at any time.</small></span>
        </label>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span style={{ padding: "6px 10px", borderRadius: 20, background: marketplacePublished ? "#ecfdf5" : "#f1f5f9", color: marketplacePublished ? "#047857" : "#64748b", fontSize: 11, fontWeight: 700 }}>{marketplaceLoading ? "Checking status..." : marketplacePublished ? "Visible on Discover" : "Not listed publicly"}</span>
          {marketplaceSaving && <small style={{ color: "#64748b" }}>Saving marketplace preference...</small>}
          <a href="https://sabibyxtop.com.ng/discover" target="_blank" rel="noreferrer" style={{ color: "#0f766e", fontSize: 12, fontWeight: 700 }}>Preview Sabi Discover ↗</a>
        </div>
      </div>

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

      <form onSubmit={saveDeliverySettings} style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <Truck size={24} color="#0f766e" />
          <div>
            <h2 style={{ margin: 0 }}>Merchant delivery calculator</h2>
            <p style={{ color: "#64748b", margin: "5px 0 0" }}>Choose either merchant flat-fee delivery or road-distance pricing. Road-distance pricing needs a verified pickup address. You remain responsible for dispatch and delivery; Sabi does not provide riders or book couriers.</p>
          </div>
        </div>
        {deliveryError && <div role="alert" style={{ color: "#b91c1c", background: "#fef2f2", padding: 10, borderRadius: 8, margin: "10px 0" }}>{deliveryError}</div>}
        {deliverySuccess && <div role="status" style={{ color: "#047857", background: "#ecfdf5", padding: 10, borderRadius: 8, margin: "10px 0" }}>{deliverySuccess}</div>}
        {deliveryLoading ? <p>Loading delivery settings...</p> : <>
          <label style={{ display: "block", marginTop: 14 }}><strong>Pickup street address {deliverySettings.pricing_enabled === true ? "(required)" : "(optional)"}</strong>
            <input value={deliverySettings.pickup_address || ""} onChange={e=>setDeliverySettings((v:any)=>({...v,pickup_address:e.target.value}))} style={fieldStyle} placeholder="Shop number, street and area" required={deliverySettings.pricing_enabled === true}/>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            <label style={{ display: "block", marginTop: 12 }}><strong>City / town</strong>
              <input value={deliverySettings.pickup_city || ""} onChange={e=>setDeliverySettings((v:any)=>({...v,pickup_city:e.target.value}))} style={fieldStyle} placeholder="e.g. Benin City" required={deliverySettings.pricing_enabled === true}/>
            </label>
            <label style={{ display: "block", marginTop: 12 }}><strong>State</strong>
              <input value={deliverySettings.pickup_state || ""} onChange={e=>setDeliverySettings((v:any)=>({...v,pickup_state:e.target.value}))} style={fieldStyle} placeholder="e.g. Edo" required={deliverySettings.pricing_enabled === true}/>
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}><strong>Local Government Area (optional)</strong>
            <input value={deliverySettings.pickup_lga || ""} onChange={e=>setDeliverySettings((v:any)=>({...v,pickup_lga:e.target.value}))} style={fieldStyle} placeholder="e.g. Oredo"/>
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 18 }}>
            <input type="checkbox" checked={deliverySettings.pricing_enabled === true} disabled={!deliveryConfigured} onChange={e=>setDeliverySettings((v:any)=>({...v,pricing_enabled:e.target.checked}))}/>
            <span><strong>Calculate delivery by road distance</strong><small style={{ display: "block", color: "#64748b", marginTop: 4 }}>When enabled, Sabi uses Geoapify driving distance and your rates below. If routing is temporarily unavailable, your existing flat delivery fee is used when it is greater than zero.</small></span>
          </label>
          {deliverySettings.pricing_enabled === true && <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginTop: 12 }}>
              <label><strong>Base charge (₦)</strong><input type="number" min="0" step="1" value={deliverySettings.base_fee ?? 0} onChange={e=>setDeliverySettings((v:any)=>({...v,base_fee:e.target.value}))} style={fieldStyle}/></label>
              <label><strong>Charge per km (₦)</strong><input type="number" min="0" step="1" value={deliverySettings.per_km_fee ?? 0} onChange={e=>setDeliverySettings((v:any)=>({...v,per_km_fee:e.target.value}))} style={fieldStyle}/></label>
              <label><strong>Minimum delivery fee (₦)</strong><input type="number" min="0" step="1" value={deliverySettings.minimum_fee ?? 0} onChange={e=>setDeliverySettings((v:any)=>({...v,minimum_fee:e.target.value}))} style={fieldStyle}/></label>
              <label><strong>Maximum delivery distance (km)</strong><input type="number" min="1" max="1000" step="1" value={deliverySettings.max_delivery_km ?? 100} onChange={e=>setDeliverySettings((v:any)=>({...v,max_delivery_km:e.target.value}))} style={fieldStyle}/></label>
            </div>
            <p style={{ color: "#64748b", fontSize: 12 }}>Delivery fee = the greater of your minimum fee or (base charge + road distance × charge per km). The final amount is rounded up to the next naira.</p>
          </>}
          {deliverySettings.geocoded_label && <small style={{ display: "block", color: "#047857", marginTop: 10 }}> <CheckCircle size={14} style={{ display: "inline", verticalAlign: "middle" }}/> Verified pickup location: {deliverySettings.geocoded_label}</small>}
          {!deliveryConfigured && <small style={{ display: "block", color: "#92400e", background: "#fffbeb", padding: 10, borderRadius: 8, marginTop: 12 }}>Geoapify is not currently configured. Distance pricing cannot be activated until the API key is available.</small>}
        </>}
        <button type="submit" disabled={deliverySaving || deliveryLoading} style={{ marginTop: 16, padding: "11px 18px", border: 0, borderRadius: 9, background: "#0f766e", color: "#fff", fontWeight: 700 }}>
          {deliverySaving ? "Verifying and saving..." : "Verify pickup address and save"}
        </button>
      </form>

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
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <MessageCircle size={26} color="#16a34a" />
          <div>
            <h2 style={{ margin: 0 }}>Business WhatsApp connection</h2>
            <p style={{ color: "#64748b", marginBottom: 0 }}>Connect the dedicated WhatsApp number your customers will use to contact your business.</p>
          </div>
        </div>
        <div style={{ padding: 14, borderRadius: 10, background: whatsappConnected ? "#ecfdf5" : "#f8fafc", border: "1px solid #e2e8f0", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            {whatsappConnected ? <CheckCircle size={20} color="#047857" /> : <AlertCircle size={20} color="#64748b" />}
            <strong>{whatsappLoading ? "Checking connection..." : whatsappConnected ? "WhatsApp connected" : "WhatsApp not connected"}</strong>
          </div>
          {whatsappConnected && <div style={{ marginTop: 8, color: "#047857" }}>
            <strong>{whatsappPhone || "Business number connected"}</strong>
            {whatsappVerifiedName && <small style={{ display: "block", marginTop: 4 }}>Verified business name: {whatsappVerifiedName}</small>}
          </div>}
        </div>
        {whatsappError && <div role="alert" style={{ padding: 12, marginBottom: 14, borderRadius: 9, background: "#fef2f2", color: "#b91c1c" }}>{whatsappError}</div>}
        {whatsappRegistrationSuccess && <div role="status" style={{ padding: 12, marginBottom: 14, borderRadius: 9, background: "#ecfdf5", color: "#047857" }}>{whatsappRegistrationSuccess}</div>}
        {whatsappConnected ? (
          <div>
            <p style={{ color: "#047857" }}>Your business number is connected to this merchant workspace. It will remain connected while you complete this activation step.</p>
            <p style={{ color: "#64748b", lineHeight: 1.6 }}>Choose a six-digit two-step verification PIN and keep it somewhere safe. Meta uses it to register this existing number for Cloud API messaging. Do not share it with anyone.</p>
            <label htmlFor="whatsapp-registration-pin"><strong>Six-digit WhatsApp PIN</strong></label>
            <input
              id="whatsapp-registration-pin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              pattern="[0-9]{6}"
              value={whatsappPin}
              onChange={e => setWhatsappPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Enter 6 digits"
              style={fieldStyle}
              disabled={whatsappRegistering}
            />
            <button
              type="button"
              onClick={registerWhatsAppNumber}
              disabled={whatsappRegistering || whatsappPin.length !== 6}
              style={{ display: "inline-flex", alignItems: "center", gap: 9, marginTop: 14, padding: "12px 20px", border: 0, borderRadius: 9, background: "#0f766e", color: "#fff", fontWeight: 700, cursor: whatsappRegistering ? "wait" : "pointer", opacity: whatsappRegistering || whatsappPin.length !== 6 ? 0.65 : 1 }}
            >
              {whatsappRegistering ? "Registering with Meta..." : "Register existing WhatsApp number"}
            </button>
          </div>
        ) : (
          <>
            <p style={{ color: "#64748b", lineHeight: 1.6 }}>Use a dedicated business number that you can verify by SMS or phone call. Do not connect your personal number unless you deliberately intend to dedicate it to business automation.</p>
            <button type="button" onClick={connectWhatsApp} disabled={whatsappLoading || whatsappConnecting} style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "12px 20px", border: 0, borderRadius: 9, background: "#16a34a", color: "#fff", fontWeight: 700, cursor: whatsappConnecting ? "wait" : "pointer", opacity: whatsappLoading || whatsappConnecting ? 0.65 : 1 }}>
              <MessageCircle size={18} />
              {whatsappConnecting ? "Preparing Meta signup..." : "Connect Business WhatsApp"}
            </button>
          </>
        )}
      </div>

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
