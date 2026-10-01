// Écran d'accueil : la liste des documents scannés.

import { creerDocument, listerDocuments } from "./db.js";
import { importerFichiers } from "./pages.js";
import { aller } from "./routeur.js";
import { $, choisirFichiers, dateCourte, el, message, nomParDefaut, urlTemporaire } from "./utils.js";

function carteDocument(doc) {
  const carte = el("button", "sx-doc");
  carte.type = "button";
  const vignette = el("div", "sx-doc-vignette");
  if (doc.couverture) {
    const img = new Image();
    img.alt = "";
    img.src = urlTemporaire(doc.couverture);
    vignette.append(img);
  } else vignette.textContent = "📄";
  const infos = el("div", "sx-doc-infos");
  infos.append(el("strong", "", doc.nom), el("span", "", `${doc.pages.length} page${doc.pages.length > 1 ? "s" : ""} · ${dateCourte(doc.modifieLe)}`));
  carte.append(vignette, infos);
  carte.addEventListener("click", () => aller("document", { id: doc.id }));
  return carte;
}

export async function afficher() {
  const docs = await listerDocuments();
  const liste = $("sx-docs");
  liste.replaceChildren();
  if (!docs.length) {
    liste.append(el("div", "sx-vide", "Aucun document pour l'instant.\nAppuie sur 📸 pour scanner ton premier document, ou importe des photos de ta galerie."));
    return;
  }
  liste.append(...docs.map(carteDocument));
}

export function initialiserAccueil() {
  $("sx-scanner-btn").addEventListener("click", () => aller("camera", { docId: null }));
  $("sx-importer-btn").addEventListener("click", async () => {
    const fichiers = await choisirFichiers();
    if (!fichiers.length) return;
    const doc = await creerDocument(nomParDefaut());
    const n = await importerFichiers(doc.id, fichiers, (i, total) => message(`Import ${i}/${total}…`, 60000));
    if (!n) return message("Aucune image lisible dans ce choix.");
    aller("document", { id: doc.id });
  });
}

export function quitter() {}
