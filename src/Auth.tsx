
import { useState } from "react";
import { supabase } from "./lib/supabase";

type AuthProps = {
  onAuthenticated: () => void;
};

export default function Auth({ onAuthenticated }: AuthProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [ownerName, setOwnerName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [personalWhatsApp, setPersonalWhatsApp] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const sessionToken = new URLSearchParams(
    window.location.search
  ).get("session_token")?.trim() || "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (mode === "signup") {
        if (!sessionToken) {
          throw new Error(
            "Please start registration from Sabi on WhatsApp and connect your dedicated business number first."
          );
        }

        if (!ownerName.trim() || !businessName.trim()) {
          throw new Error("Please enter your name and business name.");
        }

        const cleanPersonalPhone = personalWhatsApp.replace(/\D/g, "");

        if (cleanPersonalPhone && cleanPersonalPhone.length < 10) {
          throw new Error(
            "Please enter a valid personal WhatsApp number or leave it blank."
          );
        }

        const redirectUrl = new URL("/", window.location.origin);
        redirectUrl.searchParams.set("session_token", sessionToken);

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: redirectUrl.toString(),
            data: {
              owner_name: ownerName.trim(),
              business_name: businessName.trim(),
              personal_whatsapp: personalWhatsApp.trim() || null
            }
          }
        });

        if (error) throw error;

        if (data.session) {
          onAuthenticated();
        } else {
          setMessage(
            "Your account has been created. Please check your email and confirm your address. After confirmation, you will return to Sabi to finish setting up your business."
          );
          setMode("login");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) throw error;

        onAuthenticated();
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordReset() {
    if (!email.trim()) {
      setMessage("Enter your email address first.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: window.location.origin
      }
    );

    setLoading(false);

    setMessage(
      error
        ? error.message
        : "If an account exists for this email, a password reset link will be sent."
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img
            src="https://i.ibb.co/N2b6rJnY/Untitled-design-20261030-044935-0000.png"
            alt="Sabi by XTOP"
          />

          <h1>
            Sabi <span>by XTOP</span>
          </h1>

          <p>Your business. Your WhatsApp. One dashboard.</p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "selected" : ""}
            onClick={() => {
              setMode("login");
              setMessage("");
            }}
          >
            Login
          </button>

          <button
            type="button"
            className={mode === "signup" ? "selected" : ""}
            disabled={!sessionToken}
            onClick={() => {
              setMode("signup");
              setMessage("");
            }}
          >
            Create account
          </button>
        </div>

        {!sessionToken && mode === "login" && (
          <div className="auth-notice">
            <strong>New to Sabi?</strong>
            <p>
              To register your business, start from Sabi on WhatsApp.
              Connect your dedicated business WhatsApp number first.
              You can log in here if you already have an account.
            </p>
          </div>
        )}

        {mode === "signup" && sessionToken && (
          <div className="auth-notice">
            <strong>WhatsApp connection received.</strong>
            <p>
              Your dedicated business number is connected to Sabi.
              Complete your details below to create your merchant account.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <>
              <label>Owner's full name *</label>
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Your full name"
                autoComplete="name"
                required
              />

              <label>Business name *</label>
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Your business name"
                required
              />
            </>
          )}

          <label>Email address *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <label>Password *</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            minLength={6}
            required
          />

          {mode === "signup" && (
            <>
              <label>Personal WhatsApp number (optional)</label>

              <input
                type="tel"
                value={personalWhatsApp}
                onChange={(e) => setPersonalWhatsApp(e.target.value)}
                placeholder="+234..."
              />

              <div className="auth-notice">
                <strong>Important about your WhatsApp numbers</strong>
                <p>
                  The business WhatsApp number you connected is the
                  number Sabi will automate for your customers.
                  Keep your personal WhatsApp separate. You may provide
                  it above for contact purposes, but it will not be
                  connected to Sabi automation.
                </p>
              </div>
            </>
          )}

          {message && (
            <div className="auth-message" role="status">
              {message}
            </div>
          )}

          <button
            className="auth-submit"
            type="submit"
            disabled={loading || (mode === "signup" && !sessionToken)}
          >
            {loading
              ? "Please wait..."
              : mode === "login"
                ? "Login to dashboard"
                : "Complete business registration"}
          </button>
        </form>

        {mode === "login" && (
          <button
            type="button"
            className="forgot-password"
            onClick={handlePasswordReset}
            disabled={loading}
          >
            Forgot password?
          </button>
        )}

        <p className="auth-footer">
          XTOP Retail Technologies
        </p>
      </div>
    </div>
  );
}
