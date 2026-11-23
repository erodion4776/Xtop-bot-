
import { useState } from "react";
import { supabase } from "./lib/supabase";

type AuthProps = {
  onAuthenticated: () => void;
  isPasswordRecovery?: boolean;
};

export default function Auth({ onAuthenticated, isPasswordRecovery = false }: AuthProps) {
  const [mode, setMode] = useState<"login" | "signup">(() => {
    const params = new URLSearchParams(window.location.search);

    // After Meta Embedded Signup, take new merchants straight to account
    // creation. Email confirmation returns with login=1, so it opens login.
    if (params.get("login") === "1") return "login";
    if (params.get("session_token") || params.get("signup") === "1") {
      return "signup";
    }
    return "login";
  });
  const [ownerName, setOwnerName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [personalWhatsApp, setPersonalWhatsApp] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordChecks = [
    { label: "At least one small letter (a–z)", valid: /[a-z]/.test(password) },
    { label: "At least one CAPITAL letter (A–Z)", valid: /[A-Z]/.test(password) },
    { label: "At least one number (0–9)", valid: /[0-9]/.test(password) },
    { label: "At least one symbol, such as @, #, $, or !", valid: [...password].some((character) => "!@#$%^&*()_+-=[]{};':\"|<>?,./~".includes(character) || character === "\\" || character === "\`") }
  ];
  const passwordIsValid = passwordChecks.every((item) => item.valid);

  const sessionToken = new URLSearchParams(
    window.location.search
  ).get("session_token")?.trim() || "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    if ((isPasswordRecovery || mode === "signup") && !passwordIsValid) {
      setMessage("Your password is not ready yet. Please follow the four password tips shown below the password box.");
      return;
    }

    setLoading(true);

    try {
      if (isPasswordRecovery) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMessage("Your password has been updated. You can now continue to your Sabi dashboard.");
        window.history.replaceState({}, document.title, window.location.pathname);
        onAuthenticated();
        return;
      }

      if (mode === "signup") {
        if (!ownerName.trim() || !businessName.trim()) {
          throw new Error("Please enter your name and business name.");
        }

        const cleanPersonalPhone = personalWhatsApp.replace(/\D/g, "");

        if (cleanPersonalPhone && cleanPersonalPhone.length < 10) {
          throw new Error(
            "Please enter a valid personal WhatsApp number or leave it blank."
          );
        }

        // After email verification, return to the login screen while
        // retaining the Meta onboarding token for workspace activation.
        const redirectUrl = new URL("/?login=1", window.location.origin);
        if (sessionToken) {
          redirectUrl.searchParams.set("session_token", sessionToken);
        }

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
      const errorMessage =
        error instanceof Error ? error.message : "Something went wrong.";
      if (/password should contain|password does not meet|password.*character/i.test(errorMessage)) {
        setMessage("Your password needs a small letter, a CAPITAL letter, a number and a symbol. Please check the four tips below and try again.");
      } else {
        setMessage(errorMessage);
      }
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
        redirectTo: "https://sabibyxtop.com.ng/?recovery=1"
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
          {isPasswordRecovery && <p>Choose a new password for your account.</p>}

          <p>Your business. Your WhatsApp. One dashboard.</p>
        </div>

        {!isPasswordRecovery && <div className="auth-tabs">
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
            onClick={() => {
              setMessage("");
              setMode("signup");
            }}
          >
            Create account
          </button>
        </div>}

        {!isPasswordRecovery && !sessionToken && mode === "login" && (
          <div className="auth-notice">
            <strong>New to Sabi?</strong>
            <p>
              Create your Sabi merchant account first. You can connect a dedicated
              business WhatsApp number later from Settings in your dashboard.
            </p>
          </div>
        )}

        {!isPasswordRecovery && mode === "signup" && (
          <div className="auth-notice">
            <strong>WhatsApp connection is optional at this stage.</strong>
            <p>
              Create your dashboard account now. When you have a dedicated
              business number ready, connect it later from Settings.
              Your personal WhatsApp will not be connected to automation.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {!isPasswordRecovery && mode === "signup" && (
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

          {!isPasswordRecovery && (
            <>
              <label>Email address *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </>
          )}

          <label>{isPasswordRecovery ? "New password *" : "Password *"}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setMessage("");
            }}
            placeholder="Enter your password"
            autoComplete={
              mode === "login" && !isPasswordRecovery ? "current-password" : "new-password"
            }
            minLength={6}
            required
          />

          {(isPasswordRecovery || mode === "signup") && (
            <div className="password-guidance" aria-live="polite">
              <strong>Your password must include all 4:</strong>
              <ul>
                {passwordChecks.map((item) => (
                  <li key={item.label} className={item.valid ? "password-check valid" : "password-check"}>
                    <span aria-hidden="true">{item.valid ? "✓" : "○"}</span>
                    {item.label}
                  </li>
                ))}
              </ul>
              <p>Example: <strong>Sabi@2026</strong> (please create your own password).</p>
            </div>
          )}

          {!isPasswordRecovery && mode === "signup" && (
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
                  Your personal number is for contact purposes only.
                  It will not be connected to Sabi automation. Your
                  dedicated business WhatsApp number can be connected
                  later from your dashboard Settings.
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
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : isPasswordRecovery
                ? "Update password"
                : mode === "login"
                  ? "Login to dashboard"
                  : "Create merchant account"}
          </button>
        </form>

        {!isPasswordRecovery && mode === "login" && (
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
