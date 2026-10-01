// Sauvegarde complète et export d'images : un fichier ZIP, car il n'y a pas
// de lien de sauvegarde possible (les photos sont trop lourdes pour tenir
// dans une adresse, contrairement à Vallet ou MeteoAI). Tout reste un fichier
// à garder soi-même (sur le téléphone, le PC, un cloud…) : Scanix ne l'envoie
// nulle part.

import { importerBrut, listerDocuments, listerPages } from "./db.js";
import { rendrePageEnregistree } from "./rendu.js";
import { creerZip, lireZip } from "./zip.js";
import { canvasVersBlob } from "./utils.js";

const FORMAT_SAUVEGARDE = "scanix-sauvegarde-v1";

// Toutes les données de l'appli dans un fichier ZIP : un fichier manifeste.json
// (la structure) et les images de chaque page, telles qu'enregistrées.
export async function creerSauvegardeComplete(onProgres = () => {}) {
  const docs = await listerDocuments();
  const manifeste = { format: FORMAT_SAUVEGARDE, date: new Date().toISOString(), documents: [] };
  const fichiers = [];
  for (let i = 0; i < docs.length; i++) {
    onProgres(i, docs.length);
    const doc = docs[i];
    const pages = await listerPages(doc);
    manifeste.documents.push({ ...doc, couverture: undefined, pages: pages.map((p) => p.id) });
    for (const p of pages) {
      fichiers.push({ nom: `pages/${p.id}.json`, donnees: JSON.stringify({ ...p, source: undefined, miniature: undefined }) });
      fichiers.push({ nom: `pages/${p.id}.jpg`, donnees: p.source });
      fichiers.push({ nom: `pages/${p.id}.mini.jpg`, donnees: p.miniature });
    }
  }
  fichiers.unshift({ nom: "manifeste.json", donnees: JSON.stringify(manifeste) });
  onProgres(docs.length, docs.length);
  return creerZip(fichiers);
}

// Restaure une sauvegarde complète. Les documents de MÊME identifiant sont
// remplacés, les autres sont ajoutés (ne supprime jamais un document absent
// de la sauvegarde). Renvoie le nombre de documents restaurés.
export async function restaurerSauvegardeComplete(blob, onProgres = () => {}) {
  const fichiers = await lireZip(blob);
  if (!fichiers["manifeste.json"]) throw new Error("ce fichier n'est pas une sauvegarde Scanix");
  const manifeste = JSON.parse(new TextDecoder().decode(await fichiers["manifeste.json"]()));
  if (manifeste.format !== FORMAT_SAUVEGARDE) throw new Error("ce fichier n'est pas une sauvegarde Scanix");
  for (let i = 0; i < manifeste.documents.length; i++) {
    onProgres(i, manifeste.documents.length);
    const doc = manifeste.documents[i];
    const pages = [];
    for (const idPage of doc.pages) {
      const meta = JSON.parse(new TextDecoder().decode(await fichiers[`pages/${idPage}.json`]()));
      const source = new Blob([await fichiers[`pages/${idPage}.jpg`]()], { type: "image/jpeg" });
      const miniature = new Blob([await fichiers[`pages/${idPage}.mini.jpg`]()], { type: "image/jpeg" });
      pages.push({ ...meta, source, miniature });
    }
    doc.couverture = pages[0]?.miniature ?? null;
    await importerBrut(doc, pages);
  }
  onProgres(manifeste.documents.length, manifeste.documents.length);
  return manifeste.documents.length;
}

// Export des pages d'UN document, en images JPEG, dans un ZIP (sans PDF).
export async function creerZipImages(doc, pages) {
  const fichiers = [];
  for (let i = 0; i < pages.length; i++) {
    const rendu = await rendrePageEnregistree(pages[i], 2400);
    fichiers.push({ nom: `${String(i + 1).padStart(2, "0")}.jpg`, donnees: await canvasVersBlob(rendu, 0.9) });
  }
  return creerZip(fichiers);
}

export function nomSauvegarde() {
  return `scanix-sauvegarde-${new Date().toISOString().slice(0, 10)}.zip`;
}
