import { useState } from "react";
import { useAuth } from "./auth/AuthContext.jsx";
import NeuroDecipher from "./App.jsx";
import SignInPage from "./pages/SignInPage.jsx";
import SignUpPage from "./pages/SignUpPage.jsx";
import DesktopOnlyGate from "./components/DesktopOnlyGate.jsx";

/**
 * Gate for the whole app: nothing behind this renders until a user has
 * signed in or created an account. There is no admin account or admin login
 * anywhere — signing up already creates the only kind of account NeuroDecipher
 * has, and every screen past this point assumes a logged-in user.
 */
export default function AppRoot() {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState("signin");

  return (
    <DesktopOnlyGate>
      {renderRoute()}
    </DesktopOnlyGate>
  );

  function renderRoute() {
    if (loading) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0B1220",
          color: "#93C5FD",
          fontFamily: "'Roboto', Arial, sans-serif",
          fontWeight: 700,
        }}>
          Loading…
        </div>
      );
    }

    if (!user) {
      return mode === "signup"
        ? <SignUpPage onSwitchToSignIn={() => setMode("signin")} />
        : <SignInPage onSwitchToSignUp={() => setMode("signup")} />;
    }

    return <NeuroDecipher />;
  }
}
