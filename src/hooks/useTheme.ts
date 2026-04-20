import { useEffect } from "react";

export function useTheme() {
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    try {
      localStorage.removeItem("emm-theme");
    } catch {}
  }, []);

  return { isDark: false, toggle: () => {} };
}
