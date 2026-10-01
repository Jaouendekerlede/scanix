// Création d'une page de document à partir d'une photo (caméra ou galerie) :
// photo réduite, bords détectés, réglages habituels, miniature.

import { COTE_MINIATURE, COTE_SOURCE_MAX, QUALITE_SOURCE, REGLAGES_DEFAUT } from "./config.js";
import { ajouterPage } from "./db.js";
import { detecter } from "./detection.js";
import { lirePrefs, sauverPrefs } from "./prefs.js";
import { rendrePage } from "./rendu.js";
import { canvasVersBlob, ouvrirImage, versCanvas } from "./utils.js";

// Derniers réglages utilisés : les nouvelles pages les reprennent (le format
// de cadre se garde aussi, pratique pour scanner plusieurs cartes de suite).
export function reglagesPreferes() {
  return { ...REGLAGES_DEFAUT, ...lirePrefs().reglagesPreferes, rotation: 0, annotations: [] };
}

export function retenirReglages({ filtre, luminosite, contraste, nettete, format }) {
  sauverPrefs({ reglagesPreferes: { filtre, luminosite, contraste, nettete, format } });
}

export async function miniatureDe(source, page) {
  const resultat = await rendrePage(source, page, COTE_MINIATURE);
  return canvasVersBlob(resultat, 0.8);
}

// `canvas` : photo entière (n'importe quelle taille). Renvoie la page enregistrée.
export async function ajouterPageDepuisCanvas(docId, canvas, { coins, format } = {}) {
  const source = versCanvas(canvas, COTE_SOURCE_MAX);
  const detection = coins ? { coins, trouve: true } : detecter(source);
  const reglages = reglagesPreferes();
  if (format) reglages.format = format;
  const page = { coins: detection.coins, reglages };
  const miniature = await miniatureDe(source, page);
  return { page: await ajouterPage(docId, { source: await canvasVersBlob(source, QUALITE_SOURCE), coins: detection.coins, reglages, miniature }), bordsDetectes: detection.trouve };
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
