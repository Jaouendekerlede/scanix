// Écran d'un document : ses pages (réordonner au doigt, supprimer, modifier),
// l'ajout de pages, le classement (dossier, couleur), la lecture du texte
// (OCR) et la création du PDF.

import { COULEURS_DOC, QUALITES_PDF } from "./config.js";
import { deplacerPage, listerPages, majDocument, obtenirDocument, ordonnerPages, supprimerDocument, supprimerPage } from "./db.js";
import { listerDossiers, retenirDossier } from "./dossiers.js";
import { importerFichiers } from "./pages.js";
import { creerPdf } from "./pdf.js";
import { reconnaitre } from "./ocr.js";
import { rendrePageEnregistree } from "./rendu.js";
import { creerZipImages } from "./sauvegarde.js";
import { aller, retour } from "./routeur.js";
import { $, blobVersCanvas, canvasVersBlob, choisirFichiers, el, message, partagerOuTelecharger, pause, taillePropre, telechargerFichier, urlTemporaire } from "./utils.js";

let doc = null;
let pagesDoc = [];
let pdf = null; // File une fois créé
let glisseeId = null;

function carteDePage(page, i) {
  const carte = el("div", "sx-page");
  carte.draggable = true;
  carte.dataset.id = page.id;
  const img = new Image();
  img.alt = `Page ${i + 1}`;
  img.src = urlTemporaire(page.miniature);
  img.addEventListener("click", () => aller("editeur", { pageId: page.id, numero: `${i + 1}/${pagesDoc.length}` }));
  const barre = el("div", "sx-page-barre");
  barre.append(el("span", "sx-page-num", String(i + 1)));
  if (page.texte) barre.append(el("span", "sx-page-txt", "🔤"));
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
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      await action();
      await afficher({ id: doc.id });
    });
    barre.append(b);
  }
  carte.append(img, barre);

  // Réorganisation au doigt (glisser-déposer).
  carte.addEventListener("dragstart", (e) => {
    glisseeId = page.id;
    carte.classList.add("sx-glissee");
    e.dataTransfer.effectAllowed = "move";
  });
  carte.addEventListener("dragend", () => carte.classList.remove("sx-glissee"));
  carte.addEventListener("dragover", (e) => e.preventDefault());
  carte.addEventListener("drop", async (e) => {
    e.preventDefault();
    if (!glisseeId || glisseeId === page.id) return;
    const ordre = pagesDoc.map((p) => p.id);
    const depart = ordre.indexOf(glisseeId);
    const arrivee = ordre.indexOf(page.id);
    ordre.splice(arrivee, 0, ordre.splice(depart, 1)[0]);
    await ordonnerPages(doc.id, ordre);
    await afficher({ id: doc.id });
  });
  return carte;
}

export async function afficher({ id }) {
  doc = await obtenirDocument(id);
  if (!doc) return retour();
  pagesDoc = await listerPages(doc);
  $("sx-doc-titre").textContent = doc.nom;
  $("sx-doc-pastille").style.background = doc.couleur || "transparent";
  const grille = $("sx-pages");
  grille.replaceChildren();
  if (!pagesDoc.length) grille.append(el("div", "sx-vide", "Ce document n'a pas encore de page. Ajoute-en avec 📸 ou 🖼️."));
  else grille.append(...pagesDoc.map(carteDePage));
  $("sx-pdf-btn").disabled = !pagesDoc.length;
  $("sx-ocr-btn").disabled = !pagesDoc.length;
  $("sx-export-images-btn").disabled = !pagesDoc.length;
  $("sx-ocr-btn").textContent = pagesDoc.some((p) => p.texte) ? "🔤 Relire le texte" : "🔤 Lire le texte (OCR)";
}

function ouvrirClassement() {
  const sel = $("sx-doc-dossier");
  sel.replaceChildren(new Option("Aucun dossier", ""));
  // Les dossiers connus, plus celui du document (utile après une restauration
  // de sauvegarde, où le dossier existe sans être encore dans cette liste).
  const dossiers = new Set(listerDossiers());
  if (doc.dossier) dossiers.add(doc.dossier);
  for (const d of [...dossiers].sort((a, b) => a.localeCompare(b, "fr"))) sel.append(new Option(d, d));
  sel.value = doc.dossier || "";
  const couleurs = $("sx-doc-couleurs");
  couleurs.replaceChildren();
  for (const c of COULEURS_DOC) {
    const b = el("button", "sx-couleur-pastille" + (c === doc.couleur ? " actif" : ""));
    b.type = "button";
    b.style.setProperty("--c", c || "transparent");
    if (!c) b.textContent = "✕";
    b.addEventListener("click", async () => {
      await majDocument(doc.id, { couleur: c });
      doc.couleur = c;
      ouvrirClassement();
      $("sx-doc-pastille").style.background = c || "transparent";
    });
    couleurs.append(b);
  }
  $("sx-classement").showModal();
}

async function lireTexte() {
  $("sx-ocr-btn").disabled = true;
  try {
    for (let i = 0; i < pagesDoc.length; i++) {
      message(`Lecture du texte : page ${i + 1}/${pagesDoc.length}…`, 120000);
      await pause();
      const p = pagesDoc[i];
      const rendu = await rendrePageEnregistree(p, 2000);
      const { texte, mots } = await reconnaitre(rendu, (avancement, etape) => message(`${etape} : page ${i + 1}/${pagesDoc.length} (${Math.round(avancement * 100)} %)`, 120000));
      await (await import("./db.js")).majPage({ ...p, ocr: mots, texte });
    }
    message("✅ Texte reconnu : il est maintenant cherchable et copiable dans le PDF.");
  } catch (e) {
    message(`⚠️ Lecture du texte impossible : ${e.message}`);
  } finally {
    await afficher({ id: doc.id });
  }
}

// Si la case "supprimer une fois récupéré" était cochée, et que le PDF a
// vraiment été remis à la personne (pas une feuille de partage annulée), on
// supprime le document original -- jamais avant, pour ne jamais perdre les
// pages scannées si le partage/téléchargement a échoué entre-temps.
async function surPdfRecupere(reussi) {
  if (!reussi || !$("sx-pdf-supprimer").checked) return;
  const nom = doc.nom;
  await supprimerDocument(doc.id);
  $("sx-pdf").close();
  message(`🗑️ « ${nom} » supprimé : tu as déjà ton PDF.`);
  retour();
}

function ouvrirPdf() {
  pdf = null;
  $("sx-pdf-nom").value = doc.nom;
  $("sx-pdf-mdp").value = "";
  $("sx-pdf-supprimer").checked = false;
  $("sx-pdf-etat").hidden = true;
  $("sx-pdf-resultat").hidden = true;
  $("sx-pdf-creer").hidden = false;
  $("sx-pdf-creer").disabled = false;
  $("sx-pdf-texte-ligne").hidden = !pagesDoc.some((p) => p.texte);
  $("sx-pdf").showModal();
}

async function creer() {
  const q = QUALITES_PDF[$("sx-pdf-qualite").value];
  const format = $("sx-pdf-format").value;
  const disposition = $("sx-pdf-disposition").value;
  const motDePasse = $("sx-pdf-mdp").value;
  const avecTexte = $("sx-pdf-texte").checked;
  $("sx-pdf-creer").disabled = true;
  $("sx-pdf-etat").hidden = false;
  try {
    const blob = await creerPdf(
      pagesDoc.length,
      async (i) => {
        $("sx-pdf-etat").textContent = `Préparation de la page ${i + 1} sur ${pagesDoc.length}…`;
        await pause();
        return rendrePageEnregistree(pagesDoc[i], q.cote);
      },
      { format, qualite: q.qualite, disposition, motDePasse, fournirOcr: avecTexte ? async (i) => (pagesDoc[i].ocr ? { mots: pagesDoc[i].ocr } : null) : null },
    );
    const nom = ($("sx-pdf-nom").value.trim() || doc.nom).replace(/[\\/:*?"<>|]+/g, "-");
    pdf = new File([blob], `${nom}.pdf`, { type: "application/pdf" });
    $("sx-pdf-etat").hidden = true;
    $("sx-pdf-creer").hidden = true;
    $("sx-pdf-info").textContent = `✅ PDF créé : ${pagesDoc.length} page${pagesDoc.length > 1 ? "s" : ""}, ${taillePropre(pdf.size)}${motDePasse ? ", protégé par mot de passe" : ""}.`;
    $("sx-pdf-resultat").hidden = false;
  } catch (e) {
    $("sx-pdf-etat").textContent = `⚠️ Impossible de créer le PDF : ${e.message}`;
    $("sx-pdf-creer").disabled = false;
  }
}

// Le partage exige un appui récent de l'utilisateur : d'où des boutons séparés
// après la création (qui peut durer plusieurs secondes).

async function exporterImages() {
  $("sx-export-images-btn").disabled = true;
  try {
    message("Préparation des images…", 60000);
    const blob = await creerZipImages(doc, pagesDoc);
    await partagerOuTelecharger(new File([blob], `${doc.nom.replace(/[\\/:*?"<>|]+/g, "-")}.zip`, { type: "application/zip" }));
  } catch (e) {
    message(`⚠️ Export impossible : ${e.message}`);
  } finally {
    $("sx-export-images-btn").disabled = false;
  }
}

export function initialiserDocument() {
  $("sx-doc-retour").addEventListener("click", retour);
  $("sx-doc-titre").addEventListener("click", async () => {
    const nom = prompt("Nom du document :", doc.nom)?.trim();
    if (!nom) return;
    await majDocument(doc.id, { nom });
    $("sx-doc-titre").textContent = nom;
    doc.nom = nom;
  });
  $("sx-doc-classer").addEventListener("click", ouvrirClassement);
  $("sx-classement-fermer").addEventListener("click", () => $("sx-classement").close());
  $("sx-doc-dossier").addEventListener("change", async (e) => {
    await majDocument(doc.id, { dossier: e.target.value });
    doc.dossier = e.target.value;
    retenirDossier(e.target.value);
  });
  $("sx-doc-dossier-nouveau").addEventListener("click", async () => {
    const nom = prompt("Nom du nouveau dossier :")?.trim();
    if (!nom) return;
    await majDocument(doc.id, { dossier: nom });
    doc.dossier = nom;
    retenirDossier(nom);
    ouvrirClassement();
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
  $("sx-ocr-btn").addEventListener("click", lireTexte);
  $("sx-export-images-btn").addEventListener("click", exporterImages);
  $("sx-pdf-btn").addEventListener("click", ouvrirPdf);
  $("sx-pdf-creer").addEventListener("click", creer);
  $("sx-pdf-fermer").addEventListener("click", () => $("sx-pdf").close());
  $("sx-pdf-partager").addEventListener("click", async () => surPdfRecupere(await partagerOuTelecharger(pdf)));
  $("sx-pdf-telecharger").addEventListener("click", () => {
    telechargerFichier(pdf);
    surPdfRecupere(true); // un téléchargement ne peut pas être "annulé" comme une feuille de partage
  });
  for (const [cle, q] of Object.entries(QUALITES_PDF)) $("sx-pdf-qualite").append(new Option(q.nom, cle));
  $("sx-pdf-qualite").value = "haute";
}

export function quitter() {}
