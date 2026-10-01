// Liste des noms de dossiers utilisés par au moins un document (calculée à la
// volée, il n'y a pas de table séparée). Gardée à jour au fil des documents
// vus pour que les noms créés restent proposés même après suppression.

import { lirePrefs, sauverPrefs } from "./prefs.js";

export function listerDossiers() {
  return lirePrefs().dossiers ?? [];
}

export function retenirDossier(nom) {
  if (!nom) return;
  const dossiers = listerDossiers();
  if (!dossiers.includes(nom)) sauverPrefs({ dossiers: [...dossiers, nom].sort((a, b) => a.localeCompare(b, "fr")) });
}
