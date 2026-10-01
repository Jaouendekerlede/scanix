// Fenêtre Réglages : thème, espace utilisé, protection du stockage, sauvegarde
// complète (fichier ZIP) et mentions légales.

import { MENTION_COURTE, MENTION_LEGALE, VERSION_TEXTE } from "./mentions.js";
import { lirePrefs, sauverPrefs } from "./prefs.js";
import { appliquerTheme } from "./theme.js";
import { creerSauvegardeComplete, nomSauvegarde, restaurerSauvegardeComplete } from "./sauvegarde.js";
import { afficher as rafraichirAccueil } from "./accueil.js";
import { $, message, partagerOuTelecharger, taillePropre } from "./utils.js";

async function majStockage() {
  let texte = "Espace utilisé : information non disponible sur ce navigateur.";
  try {
    const { usage, quota } = await navigator.storage.estimate();
    texte = `Espace utilisé par Scanix : ${taillePropre(usage)} (sur ${taillePropre(quota)} disponibles environ).`;
    const protege = await navigator.storage.persisted?.();
    $("sx-persist").hidden = !!protege;
    $("sx-persist-etat").textContent = protege ? "🔒 Stockage protégé : le navigateur ne l'efface pas tout seul." : "Le navigateur peut effacer les données du site si le téléphone manque de place.";
  } catch {
    $("sx-persist").hidden = true;
  }
  $("sx-stockage").textContent = texte;
}

async function sauvegarderTout() {
  $("sx-sauvegarde-btn").disabled = true;
  $("sx-sauvegarde-etat").hidden = false;
  try {
    const blob = await creerSauvegardeComplete((i, n) => ($("sx-sauvegarde-etat").textContent = `Préparation… document ${i}/${n}`));
    const fichier = new File([blob], nomSauvegarde(), { type: "application/zip" });
    await partagerOuTelecharger(fichier);
    $("sx-sauvegarde-etat").textContent = `✅ Sauvegarde créée (${taillePropre(fichier.size)}). Garde-la précieusement (elle n'est pas renvoyée automatiquement à Scanix).`;
  } catch (e) {
    $("sx-sauvegarde-etat").textContent = `⚠️ Sauvegarde impossible : ${e.message}`;
  } finally {
    $("sx-sauvegarde-btn").disabled = false;
  }
}

async function restaurer(fichier) {
  $("sx-restaurer-etat").hidden = false;
  $("sx-restaurer-etat").textContent = "Lecture de la sauvegarde…";
  try {
    const n = await restaurerSauvegardeComplete(fichier, (i, total) => ($("sx-restaurer-etat").textContent = `Restauration… document ${i}/${total}`));
    $("sx-restaurer-etat").textContent = `✅ ${n} document(s) restauré(s).`;
    await rafraichirAccueil();
  } catch (e) {
    $("sx-restaurer-etat").textContent = `⚠️ Restauration impossible : ${e.message}`;
  }
}

export function initialiserReglages() {
  $("sx-version").textContent = VERSION_TEXTE;
  $("sx-mention").textContent = `${MENTION_COURTE}. ${MENTION_LEGALE}`;
  $("sx-reglages-btn").addEventListener("click", () => {
    $("sx-theme").value = lirePrefs().theme ?? "auto";
    $("sx-sauvegarde-etat").hidden = true;
    $("sx-restaurer-etat").hidden = true;
    majStockage();
    $("sx-reglages").showModal();
  });
  $("sx-reglages-fermer").addEventListener("click", () => $("sx-reglages").close());
  $("sx-theme").addEventListener("change", (e) => {
    sauverPrefs({ theme: e.target.value });
    appliquerTheme(e.target.value);
  });
  $("sx-persist").addEventListener("click", async () => {
    try {
      await navigator.storage.persist();
    } catch {
      // Refusé : le texte ci-dessous reste affiché tel quel.
    }
    majStockage();
  });
  $("sx-sauvegarde-btn").addEventListener("click", sauvegarderTout);
  $("sx-restaurer-btn").addEventListener("click", () => $("sx-restaurer-fichier").click());
  $("sx-restaurer-fichier").addEventListener("change", (e) => {
    const fichier = e.target.files[0];
    e.target.value = "";
    if (fichier) restaurer(fichier);
  });
}
