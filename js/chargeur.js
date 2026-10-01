// Chargement à la demande d'une bibliothèque (js/vendor/), une seule fois.
// Les gros fichiers (OCR) ne sont donc téléchargés que si on s'en sert.

const chargees = {};

export function chargerScript(src) {
  chargees[src] ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => {
      delete chargees[src];
      reject(new Error("bibliothèque introuvable (hors-ligne ?)"));
    };
    document.head.appendChild(s);
  });
  return chargees[src];
}
