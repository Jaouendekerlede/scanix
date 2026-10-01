// Préférences de l'appli (thème, son, signature…) : petit JSON dans le
// localStorage. Les documents, eux, sont dans IndexedDB (voir db.js).

const CLE = "scanix_prefs";

export function lirePrefs() {
  try {
    return JSON.parse(localStorage.getItem(CLE)) ?? {};
  } catch {
    return {};
  }
}

export function sauverPrefs(partiel) {
  try {
    localStorage.setItem(CLE, JSON.stringify({ ...lirePrefs(), ...partiel }));
  } catch {
    // Stockage bloqué (navigation privée) : tant pis, pas bloquant.
  }
}
