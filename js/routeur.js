// Navigation entre les écrans (accueil, document, caméra, éditeur) avec
// l'historique du navigateur : le bouton « retour » du téléphone revient à
// l'écran précédent au lieu de fermer l'appli.

import { libererUrls } from "./utils.js";

const vues = {};
let courante = null;

export function enregistrer(nom, vue) {
  vues[nom] = vue;
}

function montrer(nom, params) {
  if (courante && courante !== nom) vues[courante].quitter?.();
  document.querySelectorAll(".sx-vue").forEach((section) => (section.hidden = section.id !== `sx-v-${nom}`));
  courante = nom;
  libererUrls();
  window.scrollTo(0, 0);
  vues[nom].afficher(params);
}

export function aller(nom, params = {}, remplacer = false) {
  const etat = { nom, params };
  if (remplacer) history.replaceState(etat, "");
  else history.pushState(etat, "");
  montrer(nom, params);
}

export function retour() {
  history.back();
}

export function demarrer() {
  window.addEventListener("popstate", (e) => {
    const etat = e.state ?? { nom: "accueil", params: {} };
    montrer(etat.nom, etat.params);
  });
  history.replaceState({ nom: "accueil", params: {} }, "");
  montrer("accueil", {});
}
