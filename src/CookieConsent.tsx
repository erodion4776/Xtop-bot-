import { useEffect, useState } from "react";
import "./CookieConsent.css";

type Consent = {
  necessary: true;
  analytics: boolean;
  functional: boolean;
  marketing: boolean;
  updatedAt: string;
};

const STORAGE_KEY = "sabi:cookie-consent:v1";
const defaults: Consent = {
  necessary: true,
  analytics: false,
  functional: false,
  marketing: false,
  updatedAt: ""
};

function readConsent(): Consent | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as Partial<Consent>;
    if (typeof parsed.necessary !== "boolean") return null;
    return {
      necessary: true,
      analytics: parsed.analytics === true,
      functional: parsed.functional === true,
      marketing: parsed.marketing === true,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : ""
    };
  } catch {
    return null;
  }
}

export default function CookieConsent() {
  const [consent, setConsent] = useState<Consent | null>(() => readConsent());
  const [open, setOpen] = useState(() => readConsent() === null);
  const [settings, setSettings] = useState(false);
  const [draft, setDraft] = useState<Consent>(() => readConsent() || defaults);

  useEffect(() => {
    const openSettings = () => {
      setDraft(readConsent() || defaults);
      setSettings(true);
      setOpen(true);
    };
    window.addEventListener("sabi:open-cookie-settings", openSettings);
    return () => window.removeEventListener("sabi:open-cookie-settings", openSettings);
  }, []);

  function save(next: Consent) {
    const value = { ...next, necessary: true as const, updatedAt: new Date().toISOString() };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // The banner remains usable if browser storage is unavailable.
    }
    setConsent(value);
    setDraft(value);
    setSettings(false);
    setOpen(false);
    window.dispatchEvent(new CustomEvent("sabi:cookie-consent-changed", { detail: value }));
  }

  if (!open) return null;

  return (
    <div className="sabi-cookie-layer">
      <section className="sabi-cookie-banner" role="dialog" aria-modal="false" aria-labelledby="sabi-cookie-title">
        <div className="sabi-cookie-copy">
          <span className="sabi-cookie-eyebrow">SABI BY XTOP · YOUR PRIVACY</span>
          <h2 id="sabi-cookie-title">{settings ? "Cookie preferences" : "We value your privacy"}</h2>
          {settings ? (
            <>
              <p>Choose which optional cookies and similar technologies you allow. Essential storage stays on because it supports security and core website functions.</p>
              <div className="sabi-cookie-options">
                <label><span><strong>Essential</strong><small>Login, security, checkout and basic website functions.</small></span><input type="checkbox" checked disabled /></label>
                <label><span><strong>Functional</strong><small>Remember optional preferences to make the site easier to use.</small></span><input type="checkbox" checked={draft.functional} onChange={e => setDraft(v => ({ ...v, functional: e.target.checked }))} /></label>
                <label><span><strong>Analytics</strong><small>Help us understand website usage and improve Sabi.</small></span><input type="checkbox" checked={draft.analytics} onChange={e => setDraft(v => ({ ...v, analytics: e.target.checked }))} /></label>
                <label><span><strong>Marketing</strong><small>Support relevant campaign measurement and advertising, if used.</small></span><input type="checkbox" checked={draft.marketing} onChange={e => setDraft(v => ({ ...v, marketing: e.target.checked }))} /></label>
              </div>
            </>
          ) : (
            <p>We use essential storage to keep Sabi working safely. With your permission, optional technologies may help us remember preferences, understand site usage and measure marketing. You can accept all, reject optional items or choose your settings.</p>
          )}
          <p className="sabi-cookie-more">Read our <a href="/cookies">Cookie Policy</a> and <a href="/privacy">Privacy Policy</a>.</p>
        </div>
        <div className="sabi-cookie-actions">
          {settings ? (
            <>
              <button type="button" className="sabi-cookie-button sabi-cookie-secondary" onClick={() => save(defaults)}>Reject optional</button>
              <button type="button" className="sabi-cookie-button sabi-cookie-primary" onClick={() => save(draft)}>Save my choices</button>
              <button type="button" className="sabi-cookie-text-button" onClick={() => save({ ...defaults, analytics: true, functional: true, marketing: true })}>Accept all</button>
            </>
          ) : (
            <>
              <button type="button" className="sabi-cookie-button sabi-cookie-secondary" onClick={() => save(defaults)}>Reject optional</button>
              <button type="button" className="sabi-cookie-button sabi-cookie-secondary" onClick={() => { setDraft(readConsent() || defaults); setSettings(true); }}>Cookie settings</button>
              <button type="button" className="sabi-cookie-button sabi-cookie-primary" onClick={() => save({ ...defaults, analytics: true, functional: true, marketing: true })}>Accept all</button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
