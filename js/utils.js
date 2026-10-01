// Petits outils partagés : accès au DOM, messages, images, adresses temporaires.

export const $ = (id) => document.getElementById(id);

export function el(balise, classe, texte) {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

let delaiMessage = null;
// Message court en bas de l'écran (à la place d'un alert qui bloque).
export function message(texte, duree = 3500) {
  const m = $("sx-message");
  m.textContent = texte;
  m.hidden = false;
  clearTimeout(delaiMessage);
  delaiMessage = setTimeout(() => (m.hidden = true), duree);
}

export function dateCourte(ts) {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function nomParDefaut() {
  const d = new Date();
  return `Scan du ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function taillePropre(octets) {
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

// Plusieurs méthodes de lecture : certains navigateurs mobiles refusent
// createImageBitmap avec des options, ou certains formats.
export async function ouvrirImage(fichier) {
  try {
    return await createImageBitmap(fichier, { imageOrientation: "from-image" });
  } catch {
    try {
      return await createImageBitmap(fichier);
    } catch {
      const url = URL.createObjectURL(fichier);
      const img = new Image();
      img.src = url;
      try {
        await img.decode();
      } finally {
        URL.revokeObjectURL(url);
      }
      return img;
    }
  }
}

// Dessine une image (bitmap, canvas ou <video>) dans un canvas, réduit si besoin.
export function versCanvas(image, coteMax = Infinity) {
  const largeur = image.videoWidth ?? image.width;
  const hauteur = image.videoHeight ?? image.height;
  const echelle = Math.min(1, coteMax / Math.max(largeur, hauteur));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(largeur * echelle));
  canvas.height = Math.max(1, Math.round(hauteur * echelle));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasVersBlob(canvas, qualite = 0.88) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("image impossible à encoder"))), "image/jpeg", qualite));
}

export async function blobVersCanvas(blob, coteMax = Infinity) {
  const image = await ouvrirImage(blob);
  const canvas = versCanvas(image, coteMax);
  image.close?.();
  return canvas;
}

// Adresses temporaires pour afficher des Blob : libérées au changement d'écran.
let urlsTemporaires = [];
export function urlTemporaire(blob) {
  const url = URL.createObjectURL(blob);
  urlsTemporaires.push(url);
  return url;
}
export function libererUrls() {
  urlsTemporaires.forEach((u) => URL.revokeObjectURL(u));
  urlsTemporaires = [];
}

// Ouvre le sélecteur de fichiers (galerie, ou appareil photo avec `capture`)
// et renvoie les images choisies (liste vide si annulé).
export function choisirFichiers({ capture = false } = {}) {
  return new Promise((resolve) => {
    const champ = document.createElement("input");
    champ.type = "file";
    champ.accept = "image/*";
    champ.multiple = !capture;
    if (capture) champ.capture = "environment";
    champ.onchange = () => resolve([...champ.files]);
    champ.oncancel = () => resolve([]);
    champ.click();
  });
}

// Laisse respirer l'interface pendant un long calcul (barre de progression…).
export const pause = () => new Promise((r) => setTimeout(r, 0));

export function telechargerFichier(fichier) {
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(fichier);
  lien.download = fichier.name;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(lien.href), 10000);
}

// Propose le partage natif (feuille de partage du téléphone) ; si le partage
// échoue pour une autre raison qu'une annulation volontaire (refusé par le
// système, pas de gestionnaire compatible…), on ne perd pas le fichier : il
// est téléchargé à la place.
export async function partagerOuTelecharger(fichier) {
  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: fichier.name });
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // l'utilisateur a fermé la feuille de partage
    }
  }
  telechargerFichier(fichier);
}
