// Stockage local en IndexedDB (les images pèsent trop pour le localStorage,
// limité à ~5 Mo). Deux magasins :
//  - documents : { id, nom, dossier, couleur, texte, creeLe, modifieLe, pages: [idPage…], couverture }
//  - pages : { id, docId, source (Blob JPEG), coins, reglages, annotations, ocr, texte, miniature (Blob) }
// Tout reste sur l'appareil. La sauvegarde complète passe par un fichier ZIP
// (voir sauvegarde.js) : un lien ne peut pas contenir des dizaines de Mo d'images.

const NOM_BASE = "scanix";
let promesseBase = null;

function ouvrir() {
  promesseBase ??= new Promise((resolve, reject) => {
    const requete = indexedDB.open(NOM_BASE, 1);
    requete.onupgradeneeded = () => {
      requete.result.createObjectStore("documents", { keyPath: "id" });
      requete.result.createObjectStore("pages", { keyPath: "id" });
    };
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error);
  });
  return promesseBase;
}

const demande = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const termine = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("enregistrement annulé (espace plein ?)"));
  });

const nouvelId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function listerDocuments() {
  const db = await ouvrir();
  const docs = await demande(db.transaction("documents").objectStore("documents").getAll());
  return docs.sort((a, b) => b.modifieLe - a.modifieLe);
}

export async function obtenirDocument(id) {
  const db = await ouvrir();
  return (await demande(db.transaction("documents").objectStore("documents").get(id))) ?? null;
}

export async function creerDocument(nom) {
  const db = await ouvrir();
  const maintenant = Date.now();
  const doc = { id: nouvelId(), nom, dossier: "", couleur: "", texte: "", creeLe: maintenant, modifieLe: maintenant, pages: [], couverture: null };
  const tx = db.transaction("documents", "readwrite");
  tx.objectStore("documents").put(doc);
  await termine(tx);
  return doc;
}

// Met à jour des champs du document (nom, dossier, couleur…).
export async function majDocument(id, champs) {
  const db = await ouvrir();
  const tx = db.transaction("documents", "readwrite");
  const magasin = tx.objectStore("documents");
  const doc = await demande(magasin.get(id));
  if (doc) magasin.put({ ...doc, ...champs, modifieLe: Date.now() });
  await termine(tx);
}

export async function supprimerDocument(id) {
  const db = await ouvrir();
  const tx = db.transaction(["documents", "pages"], "readwrite");
  const doc = await demande(tx.objectStore("documents").get(id));
  for (const idPage of doc?.pages ?? []) tx.objectStore("pages").delete(idPage);
  tx.objectStore("documents").delete(id);
  await termine(tx);
}

export async function obtenirPage(id) {
  const db = await ouvrir();
  return (await demande(db.transaction("pages").objectStore("pages").get(id))) ?? null;
}

// Toutes les pages d'un document, dans l'ordre.
export async function listerPages(doc) {
  const db = await ouvrir();
  const magasin = db.transaction("pages").objectStore("pages");
  const pages = await Promise.all(doc.pages.map((id) => demande(magasin.get(id))));
  return pages.filter(Boolean);
}

// Ajoute une page à la fin. `page` : { source, coins, reglages, miniature, … }.
export async function ajouterPage(docId, page) {
  const db = await ouvrir();
  const tx = db.transaction(["documents", "pages"], "readwrite");
  const doc = await demande(tx.objectStore("documents").get(docId));
  if (!doc) throw new Error("document introuvable");
  const complete = { annotations: [], ocr: null, texte: "", ...page, id: nouvelId(), docId };
  tx.objectStore("pages").put(complete);
  doc.pages.push(complete.id);
  doc.modifieLe = Date.now();
  if (doc.pages.length === 1) doc.couverture = complete.miniature;
  tx.objectStore("documents").put(doc);
  await termine(tx);
  return complete;
}

// Met à jour une page existante (cadre, réglages, annotations, texte reconnu…).
// Le texte du document (pour la recherche) est recalculé à partir de ses pages.
export async function majPage(page) {
  const db = await ouvrir();
  const tx = db.transaction(["documents", "pages"], "readwrite");
  tx.objectStore("pages").put(page);
  const doc = await demande(tx.objectStore("documents").get(page.docId));
  if (doc) {
    doc.modifieLe = Date.now();
    if (doc.pages[0] === page.id) doc.couverture = page.miniature;
    const pages = await Promise.all(doc.pages.map((id) => demande(tx.objectStore("pages").get(id))));
    doc.texte = pages.map((p) => p?.texte ?? "").join("\n").trim();
    tx.objectStore("documents").put(doc);
  }
  await termine(tx);
}

export async function supprimerPage(docId, idPage) {
  const db = await ouvrir();
  const tx = db.transaction(["documents", "pages"], "readwrite");
  const doc = await demande(tx.objectStore("documents").get(docId));
  tx.objectStore("pages").delete(idPage);
  if (doc) {
    doc.pages = doc.pages.filter((p) => p !== idPage);
    doc.modifieLe = Date.now();
    const pages = await Promise.all(doc.pages.map((id) => demande(tx.objectStore("pages").get(id))));
    doc.texte = pages.map((p) => p?.texte ?? "").join("\n").trim();
    doc.couverture = pages[0]?.miniature ?? null;
    tx.objectStore("documents").put(doc);
  }
  await termine(tx);
}

// Décale une page (delta = -1 vers le début, +1 vers la fin).
export async function deplacerPage(docId, idPage, delta) {
  const doc = await obtenirDocument(docId);
  const i = doc?.pages.indexOf(idPage) ?? -1;
  const j = i + delta;
  if (i < 0 || j < 0 || j >= doc.pages.length) return;
  const ordre = [...doc.pages];
  [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
  await ordonnerPages(docId, ordre);
}

// Impose un nouvel ordre (liste d'identifiants de pages, la même qu'avant, réordonnée).
export async function ordonnerPages(docId, ordre) {
  const db = await ouvrir();
  const tx = db.transaction(["documents", "pages"], "readwrite");
  const doc = await demande(tx.objectStore("documents").get(docId));
  if (doc && ordre.length === doc.pages.length && ordre.every((id) => doc.pages.includes(id))) {
    doc.pages = ordre;
    doc.modifieLe = Date.now();
    const premiere = await demande(tx.objectStore("pages").get(ordre[0]));
    doc.couverture = premiere?.miniature ?? null;
    tx.objectStore("documents").put(doc);
  }
  await termine(tx);
}

// Restauration d'une sauvegarde : remplace le document et ses pages tels quels.
export async function importerBrut(doc, pages) {
  const db = await ouvrir();
  const tx = db.transaction(["documents", "pages"], "readwrite");
  const ancien = await demande(tx.objectStore("documents").get(doc.id));
  for (const idPage of ancien?.pages ?? []) tx.objectStore("pages").delete(idPage);
  for (const p of pages) tx.objectStore("pages").put(p);
  tx.objectStore("documents").put(doc);
  await termine(tx);
}
