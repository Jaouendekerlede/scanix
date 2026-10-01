// Création d'une page de document à partir d'une photo (caméra ou galerie) :
// photo réduite, bords détectés, réglages habituels, miniature.

import { COTE_MINIATURE, COTE_SOURCE_MAX, QUALITE_SOURCE, REGLAGES_DEFAUT } from "./config.js";
import { ajouterPage } from "./db.js";
import { detecterCoins } from "./detection.js";
import { appliquer } from "./filtres.js";
import { redresser } from "./geometrie.js";
import { canvasVersBlob, ouvrirImage, versCanvas } from "./utils.js";

const CLE_REGLAGES = "scanix_reglages";

// Derniers réglages utilisés : les nouvelles pages les reprennent.
export function reglagesPreferes() {
  try {
    return { ...REGLAGES_DEFAUT, ...JSON.parse(localStorage.getItem(CLE_REGLAGES)), rotation: 0 };
  } catch {
    return { ...REGLAGES_DEFAUT };
  }
}

export function retenirReglages({ filtre, luminosite, contraste, nettete }) {
  try {
    localStorage.setItem(CLE_REGLAGES, JSON.stringify({ filtre, luminosite, contraste, nettete }));
  } catch {
    // Stockage bloqué : tant pis, les réglages par défaut serviront.
  }
}

export async function miniatureDe(source, coins, reglages) {
  const resultat = appliquer(redresser(source, coins, COTE_MINIATURE), reglages);
  return canvasVersBlob(resultat, 0.8);
}

// `canvas` : photo entière (n'importe quelle taille). Renvoie la page enregistrée.
export async function ajouterPageDepuisCanvas(docId, canvas) {
  const source = versCanvas(canvas, COTE_SOURCE_MAX);
  const coins = detecterCoins(source);
  const reglages = reglagesPreferes();
  const miniature = await miniatureDe(source, coins, reglages);
  return ajouterPage(docId, { source: await canvasVersBlob(source, QUALITE_SOURCE), coins, reglages, miniature });
}

// Importe des fichiers image (galerie). Renvoie le nombre de pages ajoutées.
export async function importerFichiers(docId, fichiers, onProgres = () => {}) {
  let ajoutees = 0;
  for (let i = 0; i < fichiers.length; i++) {
    onProgres(i + 1, fichiers.length);
    try {
      const image = await ouvrirImage(fichiers[i]);
      await ajouterPageDepuisCanvas(docId, versCanvas(image, COTE_SOURCE_MAX));
      image.close?.();
      ajoutees++;
    } catch {
      // Fichier illisible : on passe au suivant.
    }
  }
  return ajoutees;
}
