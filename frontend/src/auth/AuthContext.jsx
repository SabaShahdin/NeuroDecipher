import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { API, apiHeaders, getStoredAuthToken, setStoredAuthToken } from "../constants.js";

/**
 * NeuroDecipher — authentication context.
 *
 * Every account created here is a normal user account. There is no admin
 * role and no admin login anywhere in this app — signing up already creates
 * the only kind of account that exists, and every screen behind this
 * provider requires a signed-in user before it will load.
 */

const AuthContext = createContext(null);

async function readJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const loggingOutRef = useRef(false);

  const clearSession = useCallback(() => {
    setStoredAuthToken("");
    setUser(null);
  }, []);

  // Restore the session on first load if a token is already stored.
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      const token = getStoredAuthToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API}/auth/me`, { headers: apiHeaders() });
        const data = await readJsonSafe(res);
        if (cancelled) return;
        if (res.ok && data?.user) {
          setUser(data.user);
        } else {
          clearSession();
        }
      } catch {
        // Network hiccup on load — keep whatever token we have; the user can retry.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    restore();
    return () => { cancelled = true; };
  }, [clearSession]);

  // Force sign-out if any request anywhere in the app comes back with
  // "you must sign in" — e.g. an expired token after a long-running session.
  useEffect(() => {
    const previousFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const res = await previousFetch(...args);
      if (res.status === 401 && !loggingOutRef.current) {
        try {
          const clone = res.clone();
          const body = await clone.json().catch(() => ({}));
          if (body?.code === "AUTH_REQUIRED" || body?.code === "INVALID_CREDENTIALS") {
            if (body.code === "AUTH_REQUIRED") {
              loggingOutRef.current = true;
              clearSession();
              setTimeout(() => { loggingOutRef.current = false; }, 0);
            }
          }
        } catch {
          /* ignore — don't let auth bookkeeping break the original request */
        }
      }
      return res;
    };
    return () => { window.fetch = previousFetch; };
  }, [clearSession]);

  const login = useCallback(async (email, password) => {
    setAuthError(null);
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) {
      const message = data?.message || data?.error || "Incorrect email or password.";
      setAuthError(message);
      throw new Error(message);
    }
    setStoredAuthToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (email, password, name) => {
    setAuthError(null);
    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) {
      const message = data?.message || data?.error || "Could not create your account.";
      setAuthError(message);
      throw new Error(message);
    }
    setStoredAuthToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API}/auth/logout`, { method: "POST", headers: apiHeaders() });
    } catch {
      /* best effort — clear the local session regardless */
    }
    clearSession();
  }, [clearSession]);

  const value = useMemo(() => ({
    user, loading, authError, login, register, logout, setAuthError,
  }), [user, loading, authError, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
