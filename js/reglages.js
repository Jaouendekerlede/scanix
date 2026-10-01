// Fenêtre Réglages : espace utilisé, protection du stockage, mentions légales.

import { MENTION_COURTE, MENTION_LEGALE, VERSION_TEXTE } from "./mentions.js";
import { $, taillePropre } from "./utils.js";

async function majStockage() {
  let texte = "Espace utilisé : information non disponible sur ce navigateur.";
  try {
    const { usage, quota } = await navigator.storage.estimate();
    texte = `Espace utilisé par Scanix : ${taillePropre(usage)} (sur ${taillePropre(quota)} disponibles environ).`;
    const protege = await navigator.storage.persisted?.();
    $("sx-persist").hidden = protege ?? true;
    $("sx-persist-etat").textContent = protege ? "🔒 Stockage protégé : le navigateur ne l'efface pas tout seul." : "Le navigateur peut effacer les données du site si le téléphone manque de place.";
  } catch {
    $("sx-persist").hidden = true;
  }
  $("sx-stockage").textContent = texte;
}

export function initialiserReglages() {
  $("sx-version").textContent = VERSION_TEXTE;
  $("sx-mention").textContent = `${MENTION_COURTE}. ${MENTION_LEGALE}`;
  $("sx-reglages-btn").addEventListener("click", () => {
    majStockage();
    $("sx-reglages").showModal();
  });
  $("sx-reglages-fermer").addEventListener("click", () => $("sx-reglages").close());
  $("sx-persist").addEventListener("click", async () => {
    try {
      await navigator.storage.persist();
    } catch {
      // Refusé : le texte ci-dessous reste affiché tel quel.
    }
    majStockage();
  });
}
