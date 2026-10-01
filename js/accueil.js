// Écran d'accueil : la liste des documents scannés, avec recherche (y compris
// dans le texte reconnu par l'OCR), filtre par dossier, et classement par couleur.

import { creerDocument, listerDocuments } from "./db.js";
import { importerFichiers } from "./pages.js";
import { aller } from "./routeur.js";
import { $, choisirFichiers, dateCourte, el, message, nomParDefaut, urlTemporaire } from "./utils.js";

let tousLesDocs = [];
let recherche = "";
let dossierCourant = "toutes";

function normaliser(t) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function carteDocument(doc) {
  const carte = el("button", "sx-doc");
  carte.type = "button";
  if (doc.couleur) carte.style.setProperty("--c", doc.couleur);
  const vignette = el("div", "sx-doc-vignette");
  if (doc.couverture) {
    const img = new Image();
    img.alt = "";
    img.src = urlTemporaire(doc.couverture);
    vignette.append(img);
  } else vignette.textContent = "📄";
  if (doc.texte) vignette.append(el("span", "sx-doc-ocr", "🔤"));
  const infos = el("div", "sx-doc-infos");
  infos.append(el("strong", "", doc.nom), el("span", "", `${doc.pages.length} page${doc.pages.length > 1 ? "s" : ""} · ${dateCourte(doc.modifieLe)}${doc.dossier ? ` · ${doc.dossier}` : ""}`));
  carte.append(vignette, infos);
  carte.addEventListener("click", () => aller("document", { id: doc.id }));
  return carte;
}

function afficherFiltres() {
  const conteneur = $("sx-dossiers");
  conteneur.replaceChildren();
  // D'après les documents eux-mêmes (pas seulement les dossiers créés depuis
  // cet appareil) : une sauvegarde restaurée garde ses dossiers même ainsi.
  const dossiers = [...new Set(tousLesDocs.map((doc) => doc.dossier).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  if (!dossiers.length) {
    conteneur.hidden = true;
    return;
  }
  conteneur.hidden = false;
  const puce = (id, nom) => {
    const b = el("button", "sx-puce" + (dossierCourant === id ? " actif" : ""), nom);
    b.type = "button";
    b.addEventListener("click", () => {
      dossierCourant = id;
      rafraichir();
    });
    return b;
  };
  conteneur.append(puce("toutes", "Tous les documents"));
  for (const d of dossiers) conteneur.append(puce(d, d));
}

function rafraichir() {
  afficherFiltres();
  const requete = normaliser(recherche.trim());
  const visibles = tousLesDocs.filter((doc) => dossierCourant === "toutes" || doc.dossier === dossierCourant).filter((doc) => !requete || normaliser(`${doc.nom} ${doc.texte ?? ""}`).includes(requete));
  const liste = $("sx-docs");
  liste.replaceChildren();
  if (!tousLesDocs.length) {
    liste.append(el("div", "sx-vide", "Aucun document pour l'instant.\nAppuie sur 📸 pour scanner ton premier document, ou importe des photos de ta galerie."));
    return;
  }
  if (!visibles.length) {
    liste.append(el("div", "sx-vide", "Aucun document ne correspond."));
    return;
  }
  liste.append(...visibles.map(carteDocument));
}

export async function afficher() {
  tousLesDocs = await listerDocuments();
  rafraichir();
}

export function initialiserAccueil() {
  $("sx-recherche").addEventListener("input", (e) => {
    recherche = e.target.value;
    rafraichir();
  });
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
