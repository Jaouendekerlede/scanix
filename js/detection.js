// Détection automatique des bords d'un document. Méthode simple et gratuite
// (sans OpenCV) : on cherche la plus grande zone claire (ou sombre) de l'image
// réduite, et on prend ses 4 extrémités. C'est une AIDE : sur un papier blanc
// posé sur une table blanche, ou un fond chargé, elle se trompe, et c'est
// pourquoi le cadre reste toujours réglable à la main.

import { COINS_DEFAUT } from "./config.js";

const TAILLE = 200;

function seuilOtsu(gris) {
  const histo = new Array(256).fill(0);
  for (const v of gris) histo[v]++;
  const total = gris.length;
  let somme = 0;
  for (let i = 0; i < 256; i++) somme += i * histo[i];
  let sommeFond = 0;
  let poidsFond = 0;
  let meilleur = 0;
  let seuil = 128;
  for (let t = 0; t < 256; t++) {
    poidsFond += histo[t];
    if (!poidsFond) continue;
    const poidsObjet = total - poidsFond;
    if (!poidsObjet) break;
    sommeFond += t * histo[t];
    const ecart = poidsFond * poidsObjet * (sommeFond / poidsFond - (somme - sommeFond) / poidsObjet) ** 2;
    if (ecart > meilleur) {
      meilleur = ecart;
      seuil = t;
    }
  }
  return seuil;
}

// Plus grande composante connexe des pixels dont (gris > seuil) === clair.
function plusGrandeZone(gris, w, h, seuil, clair) {
  const vus = new Uint8Array(w * h);
  const pile = new Int32Array(w * h);
  let meilleure = null;
  for (let depart = 0; depart < w * h; depart++) {
    if (vus[depart] || gris[depart] > seuil !== clair) continue;
    let sommet = 0;
    pile[sommet++] = depart;
    vus[depart] = 1;
    const z = { aire: 0, hg: [0, Infinity], bd: [0, -Infinity], hd: [0, -Infinity], bg: [0, Infinity] };
    while (sommet) {
      const i = pile[--sommet];
      const x = i % w;
      const y = (i - x) / w;
      z.aire++;
      const somme = x + y;
      const diff = x - y;
      if (somme < z.hg[1]) z.hg = [{ x, y }, somme];
      if (somme > z.bd[1]) z.bd = [{ x, y }, somme];
      if (diff > z.hd[1]) z.hd = [{ x, y }, diff];
      if (diff < z.bg[1]) z.bg = [{ x, y }, diff];
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && !vus[j] && gris[j] > seuil === clair) {
          vus[j] = 1;
          pile[sommet++] = j;
        }
      }
    }
    if (!meilleure || z.aire > meilleure.aire) meilleure = z;
  }
  return meilleure;
}

// Renvoie 4 coins normalisés (haut-gauche, haut-droite, bas-droite, bas-gauche).
export function detecterCoins(source) {
  const echelle = Math.min(1, TAILLE / Math.max(source.width, source.height));
  const w = Math.max(8, Math.round(source.width * echelle));
  const h = Math.max(8, Math.round(source.height * echelle));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const gris = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) gris[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
  const seuil = seuilOtsu(gris);
  for (const clair of [true, false]) {
    const z = plusGrandeZone(gris, w, h, seuil, clair);
    // Valable seulement si la zone couvre une part raisonnable de l'image.
    if (z && z.aire > w * h * 0.15 && z.aire < w * h * 0.93) {
      const norm = (p) => ({ x: p[0].x / (w - 1), y: p[0].y / (h - 1) });
      return [norm(z.hg), norm(z.hd), norm(z.bd), norm(z.bg)];
    }
  }
  return COINS_DEFAUT.map((c) => ({ ...c }));
}
