// Écran d'un document : ses pages (réordonner, supprimer, modifier), l'ajout
// de pages et la création du PDF.

import { QUALITES_PDF } from "./config.js";
import { deplacerPage, listerPages, obtenirDocument, renommerDocument, supprimerDocument, supprimerPage } from "./db.js";
import { appliquer } from "./filtres.js";
import { redresser } from "./geometrie.js";
import { importerFichiers } from "./pages.js";
import { creerPdf } from "./pdf.js";
import { aller, retour } from "./routeur.js";
import { $, blobVersCanvas, choisirFichiers, el, message, pause, taillePropre, urlTemporaire } from "./utils.js";

let doc = null;
let pagesDoc = [];
let pdf = null; // { fichier } une fois créé

function carteDePage(page, i) {
  const carte = el("div", "sx-page");
  const img = new Image();
  img.alt = `Page ${i + 1}`;
  img.src = urlTemporaire(page.miniature);
  img.addEventListener("click", () => aller("editeur", { pageId: page.id, numero: `${i + 1}/${pagesDoc.length}` }));
  const barre = el("div", "sx-page-barre");
  barre.append(el("span", "sx-page-num", String(i + 1)));
  const actions = [
    ["◀", "Déplacer avant", () => deplacerPage(doc.id, page.id, -1)],
    ["▶", "Déplacer après", () => deplacerPage(doc.id, page.id, 1)],
    ["🗑️", "Supprimer la page", async () => {
      if (confirm(`Supprimer la page ${i + 1} ?`)) await supprimerPage(doc.id, page.id);
    }],
  ];
  for (const [symbole, titre, action] of actions) {
    const b = el("button", "", symbole);
    b.type = "button";
    b.title = titre;
    b.addEventListener("click", async () => {
      await action();
      await afficher({ id: doc.id });
    });
    barre.append(b);
  }
  carte.append(img, barre);
  return carte;
}

export async function afficher({ id }) {
  doc = await obtenirDocument(id);
  if (!doc) return retour();
  pagesDoc = await listerPages(doc);
  $("sx-doc-titre").textContent = doc.nom;
  const grille = $("sx-pages");
  grille.replaceChildren();
  if (!pagesDoc.length) grille.append(el("div", "sx-vide", "Ce document n'a pas encore de page. Ajoute-en avec 📸 ou 🖼️."));
  else grille.append(...pagesDoc.map(carteDePage));
  $("sx-pdf-btn").disabled = !pagesDoc.length;
}

function ouvrirPdf() {
  pdf = null;
  $("sx-pdf-nom").value = doc.nom;
  $("sx-pdf-etat").hidden = true;
  $("sx-pdf-resultat").hidden = true;
  $("sx-pdf-creer").hidden = false;
  $("sx-pdf-creer").disabled = false;
  $("sx-pdf").showModal();
}

async function creer() {
  const q = QUALITES_PDF[$("sx-pdf-qualite").value];
  const format = $("sx-pdf-format").value;
  $("sx-pdf-creer").disabled = true;
  $("sx-pdf-etat").hidden = false;
  try {
    const blob = await creerPdf(
      pagesDoc.length,
      async (i) => {
        $("sx-pdf-etat").textContent = `Préparation de la page ${i + 1} sur ${pagesDoc.length}…`;
        await pause();
        const p = pagesDoc[i];
        const photo = await blobVersCanvas(p.source);
        return appliquer(redresser(photo, p.coins, q.cote), p.reglages);
      },
      { format, qualite: q.qualite },
    );
    const nom = ($("sx-pdf-nom").value.trim() || doc.nom).replace(/[\\/:*?"<>|]+/g, "-");
    pdf = new File([blob], `${nom}.pdf`, { type: "application/pdf" });
    $("sx-pdf-etat").hidden = true;
    $("sx-pdf-creer").hidden = true;
    $("sx-pdf-info").textContent = `✅ PDF créé : ${pagesDoc.length} page${pagesDoc.length > 1 ? "s" : ""}, ${taillePropre(pdf.size)}.`;
    $("sx-pdf-resultat").hidden = false;
  } catch (e) {
    $("sx-pdf-etat").textContent = `⚠️ Impossible de créer le PDF : ${e.message}`;
    $("sx-pdf-creer").disabled = false;
  }
}

// Le partage exige un appui récent de l'utilisateur : d'où des boutons séparés
// après la création (qui peut durer plusieurs secondes).
async function partager() {
  if (navigator.canShare?.({ files: [pdf] })) {
    try {
      await navigator.share({ files: [pdf], title: pdf.name });
    } catch (e) {
      if (e.name !== "AbortError") message(`Partage impossible : ${e.message}`);
    }
  } else telecharger();
}

function telecharger() {
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(pdf);
  lien.download = pdf.name;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(lien.href), 10000);
}

export function initialiserDocument() {
  $("sx-doc-retour").addEventListener("click", retour);
  $("sx-doc-titre").addEventListener("click", async () => {
    const nom = prompt("Nom du document :", doc.nom)?.trim();
    if (!nom) return;
    await renommerDocument(doc.id, nom);
    $("sx-doc-titre").textContent = nom;
    doc.nom = nom;
  });
  $("sx-doc-supprimer").addEventListener("click", async () => {
    if (!confirm(`Supprimer le document « ${doc.nom} » et ses ${doc.pages.length} page(s) ? C'est définitif.`)) return;
    await supprimerDocument(doc.id);
    retour();
  });
  $("sx-ajouter-btn").addEventListener("click", () => aller("camera", { docId: doc.id }, false));
  $("sx-importer-doc-btn").addEventListener("click", async () => {
    const fichiers = await choisirFichiers();
    if (!fichiers.length) return;
    await importerFichiers(doc.id, fichiers, (i, n) => message(`Import ${i}/${n}…`, 60000));
    message("Import terminé.");
    await afficher({ id: doc.id });
  });
  $("sx-pdf-btn").addEventListener("click", ouvrirPdf);
  $("sx-pdf-creer").addEventListener("click", creer);
  $("sx-pdf-fermer").addEventListener("click", () => $("sx-pdf").close());
  $("sx-pdf-partager").addEventListener("click", partager);
  $("sx-pdf-telecharger").addEventListener("click", telecharger);
  for (const [cle, q] of Object.entries(QUALITES_PDF)) $("sx-pdf-qualite").append(new Option(q.nom, cle));
  $("sx-pdf-qualite").value = "haute";
}

export function quitter() {}
