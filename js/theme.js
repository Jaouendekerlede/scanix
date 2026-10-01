// Thème clair / sombre : automatique (suit le téléphone) ou forcé dans Réglages.

import { lirePrefs } from "./prefs.js";

const sombreSysteme = window.matchMedia("(prefers-color-scheme: dark)");

export function appliquerTheme(preference = lirePrefs().theme ?? "auto") {
  const theme = preference === "auto" ? (sombreSysteme.matches ? "sombre" : "clair") : preference;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "clair" ? "#eaf4f3" : "#0c1a1f");
}

sombreSysteme.addEventListener("change", () => appliquerTheme());
