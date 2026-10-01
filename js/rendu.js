// Rendu final d'une page enregistrée : redressement (avec le format choisi),
// retouche, annotations, rotation. Utilisé par l'export, la visionneuse, la
// lecture de texte et la miniature.

import { FORMATS_CADRE } from "./config.js";
import { preparerAnnotations } from "./annotations.js";
import { appliquer } from "./filtres.js";
import { redresser } from "./geometrie.js";
import { blobVersCanvas } from "./utils.js";

export const ratioDe = (format) => FORMATS_CADRE[format]?.ratio ?? null;

// `photo` : canvas de la photo d'origine ; `page` : enregistrement de la page.
export async function rendrePage(photo, page, coteMax) {
  await preparerAnnotations(page.annotations);
  const redressee = redresser(photo, page.coins, coteMax, ratioDe(page.reglages.format));
  return appliquer(redressee, { ...page.reglages, annotations: page.annotations ?? [] });
}

// Variante qui décode la photo de la page elle-même.
export async function rendrePageEnregistree(page, coteMax) {
  return rendrePage(await blobVersCanvas(page.source), page, coteMax);
}
