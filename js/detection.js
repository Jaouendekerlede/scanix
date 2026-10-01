// Détection automatique des bords d'un document. Méthode gratuite et sans
// bibliothèque lourde (OpenCV pèserait plus de 8 Mo) : on cherche dans l'image
// réduite la zone claire ou sombre la plus « rectangulaire » et la plus grande,
// puis on prend ses 4 extrémités. C'est une AIDE : sur un papier blanc posé sur
// une table blanche, ou un fond très chargé, elle peut se tromper, et c'est
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

// Plus grande composante connexe des pixels dont `garde(i)` est vrai.
function plusGrandeZone(garde, w, h) {
  const vus = new Uint8Array(w * h);
  const pile = new Int32Array(w * h);
  let meilleure = null;
  for (let depart = 0; depart < w * h; depart++) {
    if (vus[depart] || !garde(depart)) continue;
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
        if (j >= 0 && !vus[j] && garde(j)) {
          vus[j] = 1;
          pile[sommet++] = j;
        }
      }
    }
    if (!meilleure || z.aire > meilleure.aire) meilleure = z;
  }
  return meilleure;
}

const airePolygone = (p) => Math.abs(p.reduce((s, a, i) => s + (a.x * p[(i + 1) % 4].y - p[(i + 1) % 4].x * a.y), 0)) / 2;

// Note d'une zone candidate : grande ET proche d'un quadrilatère (une zone
// parasite, de forme irrégulière, a une note faible).
function noter(z, w, h) {
  if (!z || z.aire < w * h * 0.15 || z.aire > w * h * 0.93) return null;
  const quad = [z.hg[0], z.hd[0], z.bd[0], z.bg[0]];
  const aireQuad = airePolygone(quad);
  if (aireQuad < 1) return null;
  const rectangularite = Math.min(1, z.aire / aireQuad);
  if (rectangularite < 0.7) return null;
  return { quad, note: rectangularite * Math.sqrt(aireQuad / (w * h)) };
}

// Renvoie { coins, trouve } : 4 coins normalisés (haut-gauche, haut-droite,
// bas-droite, bas-gauche) et `trouve` = false si on retombe sur le cadre par défaut.
export function detecter(source) {
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
  const sat = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    gris[i] = (r * 299 + g * 587 + b * 114) / 1000;
    sat[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  const seuil = seuilOtsu(gris);
  // Candidats : zone claire, zone sombre, et zone peu colorée (papier blanc/gris
  // sur un fond coloré, comme une table en bois).
  const candidats = [
    plusGrandeZone((i) => gris[i] > seuil, w, h),
    plusGrandeZone((i) => gris[i] <= seuil, w, h),
    plusGrandeZone((i) => sat[i] < 40 && gris[i] > seuil * 0.6, w, h),
  ];
  let meilleur = null;
  for (const z of candidats) {
    const n = noter(z, w, h);
    if (n && (!meilleur || n.note > meilleur.note)) meilleur = n;
  }
  if (!meilleur) return { coins: COINS_DEFAUT.map((c) => ({ ...c })), trouve: false };
  return { coins: meilleur.quad.map((p) => ({ x: p.x / (w - 1), y: p.y / (h - 1) })), trouve: true };
}

export function detecterCoins(source) {
  return detecter(source).coins;
}
