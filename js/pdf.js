// Création d'un PDF multi-pages à la main : chaque page est une image JPEG
// intégrée telle quelle (filtre DCTDecode). Pas de bibliothèque, aucun envoi.
// Options :
//  - texte reconnu (OCR) : couche de texte invisible par-dessus l'image, pour
//    chercher et copier des mots dans le PDF ;
//  - disposition « deux par page » : deux scans sur une feuille A4 (recto-verso
//    d'une carte, par exemple) ;
//  - mot de passe : chiffrement AES-256 (voir pdf-crypto.js).

import { preparerChiffrement } from "./pdf-crypto.js";
import { canvasVersBlob } from "./utils.js";

const A4 = { largeur: 595.28, hauteur: 841.89 };
const DPI_IMAGE = 150; // taille de page « Taille de l'image » : 150 points par pouce
const MARGE_DEUX = 36;

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

// Texte -> octets (un caractère = un octet), pour les flux de contenu.
const latin1 = (texte) => Uint8Array.from(texte, (c) => c.charCodeAt(0) & 0xff);

// Caractères hors Latin-1 présents dans l'encodage WinAnsi (cp1252).
const WIN_ANSI = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f };

function motPdf(mot) {
  let s = "";
  for (const c of mot) {
    const code = WIN_ANSI[c] ?? (c.charCodeAt(0) < 256 ? c.charCodeAt(0) : 0x3f);
    const car = String.fromCharCode(code);
    s += car === "\\" || car === "(" || car === ")" ? `\\${car}` : car;
  }
  return s;
}

// Couche de texte invisible (mode de rendu 3) alignée sur l'image placée en (ix, iy, iw, ih).
function coucheTexte(mots, ix, iy, iw, ih) {
  let s = "";
  for (const m of mots) {
    const hauteur = m.h * ih;
    const taille = Math.max(2, hauteur * 0.85);
    const naturelle = 0.5 * taille * m.t.length;
    const echelle = Math.min(400, Math.max(20, ((m.l * iw) / naturelle) * 100));
    s += `BT /F1 ${nombre(taille)} Tf 3 Tr ${nombre(echelle)} Tz 1 0 0 1 ${nombre(ix + m.x * iw)} ${nombre(iy + ih - (m.y + m.h) * ih)} Tm (${motPdf(m.t)}) Tj ET\n`;
  }
  return s;
}

// `nbPages` pages, fournies une par une par `fournir(i)` (canvas déjà retouché) :
// une seule grande image est en mémoire à la fois.
// `options` : { format: "a4" | "image", qualite, disposition: "normale" | "deux",
//   motDePasse, fournirOcr: async (i) => ({ mots }) | null }.
// `onProgres(i, total)` est appelé avant chaque page.
export async function creerPdf(nbPages, fournir, { format = "a4", qualite = 0.85, disposition = "normale", motDePasse = "", fournirOcr = null } = {}, onProgres = () => {}) {
  const chiffrement = motDePasse ? await preparerChiffrement(motDePasse) : null;
  const e = new Ecrivain();
  const offsets = [];
  let prochain = 4; // 1 = catalogue, 2 = liste des pages, 3 = police
  const nouvelObjet = () => prochain++;
  const objet = (numero, contenu) => {
    offsets[numero] = e.taille;
    e.ecrire(`${numero} 0 obj\n${contenu}\nendobj\n`);
  };
  const flux = async (numero, dict, octets) => {
    const donnees = chiffrement ? await chiffrement.chiffrerFlux(octets) : octets;
    offsets[numero] = e.taille;
    e.ecrire(`${numero} 0 obj\n<< ${dict} /Length ${donnees.length} >>\nstream\n`);
    e.ecrire(donnees);
    e.ecrire("\nendstream\nendobj\n");
  };

  e.ecrire("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n");
  objet(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objet(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

  const deux = disposition === "deux" && format === "a4";
  const groupes = [];
  for (let i = 0; i < nbPages; i += deux ? 2 : 1) groupes.push(deux ? [i, i + 1].filter((k) => k < nbPages) : [i]);
  const idsPages = [];

  for (let g = 0; g < groupes.length; g++) {
    const placees = [];
    let pw = A4.largeur;
    let ph = A4.hauteur;
    for (let rang = 0; rang < groupes[g].length; rang++) {
      const i = groupes[g][rang];
      onProgres(i, nbPages);
      const canvas = await fournir(i);
      const jpeg = new Uint8Array(await (await canvasVersBlob(canvas, qualite)).arrayBuffer());
      let ix = 0;
      let iy = 0;
      let iw;
      let ih;
      if (deux) {
        const hauteurCase = (A4.hauteur - 3 * MARGE_DEUX) / 2;
        const largeurCase = A4.largeur - 2 * MARGE_DEUX;
        const echelle = Math.min(largeurCase / canvas.width, hauteurCase / canvas.height);
        iw = canvas.width * echelle;
        ih = canvas.height * echelle;
        ix = (A4.largeur - iw) / 2;
        iy = A4.hauteur - MARGE_DEUX - (hauteurCase + ih) / 2 - rang * (hauteurCase + MARGE_DEUX);
      } else if (format === "image") {
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
      const ocr = fournirOcr ? await fournirOcr(i) : null;
      const idImage = nouvelObjet();
      await flux(idImage, `/Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, jpeg);
      placees.push({ idImage, ix, iy, iw, ih, mots: ocr?.mots ?? [] });
    }
    let contenu = "";
    placees.forEach((p, k) => {
      contenu += `q ${nombre(p.iw)} 0 0 ${nombre(p.ih)} ${nombre(p.ix)} ${nombre(p.iy)} cm /Im${k} Do Q\n`;
      if (p.mots.length) contenu += coucheTexte(p.mots, p.ix, p.iy, p.iw, p.ih);
    });
    const idContenu = nouvelObjet();
    await flux(idContenu, "", latin1(contenu));
    const idPage = nouvelObjet();
    idsPages.push(idPage);
    objet(idPage, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${nombre(pw)} ${nombre(ph)}] /Resources << /XObject << ${placees.map((p, k) => `/Im${k} ${p.idImage} 0 R`).join(" ")} >> /Font << /F1 3 0 R >> >> /Contents ${idContenu} 0 R >>`);
  }

  objet(2, `<< /Type /Pages /Count ${idsPages.length} /Kids [${idsPages.map((id) => `${id} 0 R`).join(" ")}] >>`);
  let idChiffrement = 0;
  if (chiffrement) {
    idChiffrement = nouvelObjet();
    objet(idChiffrement, chiffrement.dictionnaire);
  }

  const debutXref = e.taille;
  e.ecrire(`xref\n0 ${prochain}\n0000000000 65535 f \n`);
  for (let i = 1; i < prochain; i++) e.ecrire(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  const id = chiffrement ? chiffrement.idFichier : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  e.ecrire(`trailer\n<< /Size ${prochain} /Root 1 0 R${chiffrement ? ` /Encrypt ${idChiffrement} 0 R` : ""} /ID [<${id}> <${id}>] >>\nstartxref\n${debutXref}\n%%EOF\n`);
  onProgres(nbPages, nbPages);
  return new Blob(e.morceaux, { type: "application/pdf" });
}
