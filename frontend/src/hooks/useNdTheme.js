import { useEffect, useState } from "react";
import { buildNdThemeTokens, ND_THEME_STORAGE_KEY } from "../theme/ndThemeTokens.js";

export function useNdThemeTokens() {
  const [theme, setTheme] = useState(() => {
    try { return window.localStorage.getItem(ND_THEME_STORAGE_KEY) || "dark"; } catch { return "dark"; }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(ND_THEME_STORAGE_KEY, theme);
      document.documentElement.setAttribute("data-theme", theme);
    } catch {}
  }, [theme]);

  return { theme, setTheme, C: buildNdThemeTokens(theme) };
}
