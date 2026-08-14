import { useState } from "react";
import { useNdThemeTokens } from "../hooks/useNdTheme.js";
import { hexToRgba } from "../components/utils.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { BrainMark, ThemeToggle, MessageBox, authInputStyle, authLabelStyle } from "../components/auth/AuthUI.jsx";

const MIN_PASSWORD_LENGTH = 8;

export default function SignUpPage({ onSwitchToSignIn }) {
  const { theme, setTheme, C } = useNdThemeTokens();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Please enter your email and a password.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await register(email.trim().toLowerCase(), password, name.trim() || undefined);
    } catch (err) {
      setError(err?.message || "Could not create your account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: C.dark
        ? "radial-gradient(1200px 600px at 50% -10%, #0B2A44 0%, #040B14 55%), linear-gradient(135deg,#040B14 0%,#071523 58%,#05101D 100%)"
        : "radial-gradient(1200px 600px at 50% -10%, #DCEEFF 0%, #F8FAFC 55%), linear-gradient(135deg,#F8FAFC 0%,#EAF4FF 58%,#F8FAFC 100%)",
      color: C.text,
      fontFamily: "'Roboto', Arial, sans-serif",
      display: "grid",
      placeItems: "center",
      padding: 24,
    }}>
      <div style={{
        position: "relative",
        width: "100%",
        maxWidth: 400,
        background: C.panel3,
        border: `1px solid ${C.border}`,
        borderRadius: 20,
        padding: "36px 32px 30px",
        boxShadow: C.dark ? "0 30px 80px rgba(0,0,0,0.5)" : "0 24px 70px rgba(15,23,42,0.14)",
      }}>
        <ThemeToggle theme={theme} setTheme={setTheme} C={C} />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 26 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20, display: "grid", placeItems: "center",
            background: hexToRgba(C.teal, C.dark ? 0.1 : 0.07),
            border: `1px solid ${hexToRgba(C.teal, 0.35)}`, marginBottom: 14,
          }}>
            <BrainMark size={44} C={C} />
          </div>
          <div style={{ fontWeight: 950, fontSize: 22, letterSpacing: "-0.01em" }}>Create your account</div>
          <div style={{ color: C.muted, fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
            Sign up to start analysing EEG recordings
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <label style={authLabelStyle(C)}>Name (optional)</label>
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dr. Jane Doe"
            style={{ ...authInputStyle(C), marginBottom: 16 }}
          />

          <label style={authLabelStyle(C)}>Email</label>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            style={{ ...authInputStyle(C), marginBottom: 16 }}
          />

          <label style={authLabelStyle(C)}>Password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            style={{ ...authInputStyle(C), marginBottom: 16 }}
          />

          <label style={authLabelStyle(C)}>Confirm password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat your password"
            style={{ ...authInputStyle(C), marginBottom: 10 }}
          />

          <MessageBox tone="error" C={C}>{error}</MessageBox>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%", padding: "13px 14px", borderRadius: 12, border: "none",
              background: submitting
                ? hexToRgba(C.teal, 0.6)
                : `linear-gradient(135deg, ${C.teal} 0%, ${C.dark ? "#16A385" : "#0E8F76"} 100%)`,
              color: "#fff", fontWeight: 900, fontSize: 14.5, letterSpacing: "0.02em",
              cursor: submitting ? "default" : "pointer",
              boxShadow: submitting ? "none" : `0 12px 26px ${hexToRgba(C.teal, 0.35)}`,
              marginTop: 6,
            }}
          >
            {submitting ? "Creating account…" : "CREATE ACCOUNT"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 22, fontSize: 13, color: C.muted }}>
          Already have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToSignIn}
            style={{ background: "none", border: "none", color: C.teal, fontWeight: 800, cursor: "pointer", fontSize: 13, padding: 0 }}
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}
