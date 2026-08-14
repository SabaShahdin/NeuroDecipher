import { useState } from "react";
import { useNdThemeTokens } from "../hooks/useNdTheme.js";
import { hexToRgba } from "../components/utils.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { BrainMark, ThemeToggle, MessageBox, authInputStyle, authLabelStyle } from "../components/auth/AuthUI.jsx";

export default function SignInPage({ onSwitchToSignUp }) {
  const { theme, setTheme, C } = useNdThemeTokens();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      setError(err?.message || "Incorrect email or password.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = () => {
    setError("");
    setInfo("Password resets aren't automated yet — please contact your clinic administrator.");
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

        {/* Brand */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 26 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20, display: "grid", placeItems: "center",
            // background: hexToRgba(C.teal, C.dark ? 0.1 : 0.07),
            // border: `1px solid ${hexToRgba(C.teal, 0.35)}`, marginBottom: 14,
          }}>
            <BrainMark size={84} C={C} />
          </div>
          <div style={{ fontWeight: 950, fontSize: 22, letterSpacing: "-0.01em" }}>Neuro Decipher</div>
          <div style={{ color: C.muted, fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
            An Automated Brain Signal Annotation System
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
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
          <div style={{ position: "relative", marginBottom: 10 }}>
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              style={authInputStyle(C, { paddingRight: 42 })}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                width: 30, height: 30, display: "grid", placeItems: "center",
                border: "none", background: "transparent", color: C.teal, cursor: "pointer",
              }}
            >
              {showPassword ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path d="M3 3l18 18M10.6 10.6a3 3 0 004.24 4.24M6.6 6.7C4.3 8.3 2.7 10.5 2 12c1.6 3.6 5.4 7 10 7 1.6 0 3.1-.4 4.4-1.1M17.4 17.3C19.5 15.7 21 13.5 22 12c-1.6-3.6-5.4-7-10-7-.9 0-1.8.13-2.6.36" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
                </svg>
              )}
            </button>
          </div>

          <div style={{ textAlign: "right", marginBottom: 16 }}>
            <button
              type="button"
              onClick={handleForgotPassword}
              style={{ background: "none", border: "none", color: C.teal, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: 0 }}
            >
              Forgot Password?
            </button>
          </div>

          <MessageBox tone="error" C={C}>{error}</MessageBox>
          <MessageBox tone="info" C={C}>{info}</MessageBox>

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
              transition: "opacity .15s ease",
            }}
          >
            {submitting ? "Signing in…" : "LOGIN"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 22, fontSize: 13, color: C.muted }}>
          Don't have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToSignUp}
            style={{ background: "none", border: "none", color: C.teal, fontWeight: 800, cursor: "pointer", fontSize: 13, padding: 0 }}
          >
            Sign up
          </button>
        </div>
      </div>
    </div>
  );
}
