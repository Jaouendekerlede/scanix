// Création d'un PDF multi-pages à la main : chaque page est une image JPEG
// intégrée telle quelle (filtre DCTDecode). Pas de bibliothèque, aucun envoi.
// Limite : le PDF contient des images, pas de texte sélectionnable (la
// reconnaissance de texte / OCR n'est pas incluse dans cette version).

import { canvasVersBlob } from "./utils.js";

const A4 = { largeur: 595.28, hauteur: 841.89 };
const DPI_IMAGE = 150; // taille de page « Taille de l'image » : 150 points par pouce

class Ecrivain {
  constructor() {
    this.morceaux = [];
    this.taille = 0;
    this.encodeur = new TextEncoder();
  }
  ecrire(donnee) {
    const octets = typeof donnee === "string" ? this.encodeur.encode(donnee) : donnee;
    this.morceaux.push(octets);
    this.taille += octets.length;
  }
}

const nombre = (n) => n.toFixed(2).replace(/\.?0+$/, "");

// `nbPages` pages, fournies une par une par `fournir(i)` (qui renvoie un canvas
// déjà retouché) : une seule grande image est en mémoire à la fois.
// `options.format` : "a4" ou "image". `onProgres(i, total)` est appelé avant chaque page.
export async function creerPdf(nbPages, fournir, { format = "a4", qualite = 0.85 } = {}, onProgres = () => {}) {
  const e = new Ecrivain();
  const offsets = [];
  const objet = (numero, contenu) => {
    offsets[numero] = e.taille;
    e.ecrire(`${numero} 0 obj\n${contenu}\nendobj\n`);
  };

  e.ecrire("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const n = nbPages;
  const idPage = (i) => 3 + 3 * i;
  objet(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objet(2, `<< /Type /Pages /Count ${n} /Kids [${Array.from({ length: n }, (_, i) => `${idPage(i)} 0 R`).join(" ")}] >>`);

  for (let i = 0; i < n; i++) {
    onProgres(i, n);
    const canvas = await fournir(i);
    const jpeg = new Uint8Array(await (await canvasVersBlob(canvas, qualite)).arrayBuffer());
    let pw;
    let ph;
    let ix = 0;
    let iy = 0;
    let iw;
    let ih;
    if (format === "image") {
      pw = (canvas.width / DPI_IMAGE) * 72;
      ph = (canvas.height / DPI_IMAGE) * 72;
      iw = pw;
      ih = ph;
    } else {
      // A4 dans le sens qui convient à la page, image centrée sans déformation.
      const paysage = canvas.width > canvas.height;
      pw = paysage ? A4.hauteur : A4.largeur;
      ph = paysage ? A4.largeur : A4.hauteur;
      const echelle = Math.min(pw / canvas.width, ph / canvas.height);
      iw = canvas.width * echelle;
      ih = canvas.height * echelle;
      ix = (pw - iw) / 2;
      iy = (ph - ih) / 2;
    }
    const flux = `q ${nombre(iw)} 0 0 ${nombre(ih)} ${nombre(ix)} ${nombre(iy)} cm /Im0 Do Q`;
    objet(idPage(i), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${nombre(pw)} ${nombre(ph)}] /Resources << /XObject << /Im0 ${idPage(i) + 2} 0 R >> >> /Contents ${idPage(i) + 1} 0 R >>`);
    objet(idPage(i) + 1, `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`);
    offsets[idPage(i) + 2] = e.taille;
    e.ecrire(`${idPage(i) + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    e.ecrire(jpeg);
    e.ecrire("\nendstream\nendobj\n");
  }

  const total = 3 + 3 * n;
  const debutXref = e.taille;
  e.ecrire(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) e.ecrire(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  e.ecrire(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`);
  onProgres(n, n);
  return new Blob(e.morceaux, { type: "application/pdf" });
}
