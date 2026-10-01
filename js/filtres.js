// Retouche d'une page : filtres « Document », gris, noir & blanc, luminosité,
// contraste, netteté, rotation. Tout est calculé pixel par pixel dans le
// navigateur (aucune bibliothèque).
//
// Le filtre « Document » : on estime l'éclairage du papier (fond), puis on
// divise chaque pixel par ce fond. Les ombres et les dégradés disparaissent,
// le papier devient blanc uniforme, le texte reste net.

const BLOC = 8;
const GAMMA_DOCUMENT = 1.4;

function flouHorizontal(src, dst, w, h, r) {
  for (let y = 0; y < h; y++) {
    const base = y * w;
    let somme = 0;
    for (let x = -r; x <= r; x++) somme += src[base + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      dst[base + x] = somme / (2 * r + 1);
      somme += src[base + Math.min(w - 1, x + r + 1)] - src[base + Math.max(0, x - r)];
    }
  }
}

function flouVertical(src, dst, w, h, r) {
  for (let x = 0; x < w; x++) {
    let somme = 0;
    for (let y = -r; y <= r; y++) somme += src[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = somme / (2 * r + 1);
      somme += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x];
    }
  }
}

function dilater(src, dst, w, h, r) {
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = -r; k <= r; k++) m = Math.max(m, src[y * w + Math.min(w - 1, Math.max(0, x + k))]);
      tmp[y * w + x] = m;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = -r; k <= r; k++) m = Math.max(m, tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]);
      dst[y * w + x] = m;
    }
  }
}

// Carte (basse résolution) de la luminosité du fond : le texte, plus sombre,
// est effacé par la dilatation, puis on lisse.
function estimerFond(d, w, h) {
  const sw = Math.max(1, Math.ceil(w / BLOC));
  const sh = Math.max(1, Math.ceil(h / BLOC));
  const petit = new Float32Array(sw * sh);
  const rouge = new Float32Array(sw * sh);
  const vert = new Float32Array(sw * sh);
  const bleu = new Float32Array(sw * sh);
  for (let by = 0; by < sh; by++) {
    for (let bx = 0; bx < sw; bx++) {
      let somme = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      for (let y = by * BLOC; y < Math.min(h, (by + 1) * BLOC); y += 2) {
        for (let x = bx * BLOC; x < Math.min(w, (bx + 1) * BLOC); x += 2) {
          const i = (y * w + x) * 4;
          somme += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
          sr += d[i];
          sg += d[i + 1];
          sb += d[i + 2];
          n++;
        }
      }
      const b = by * sw + bx;
      petit[b] = n ? somme / n : 255;
      rouge[b] = n ? sr / n : 255;
      vert[b] = n ? sg / n : 255;
      bleu[b] = n ? sb / n : 255;
    }
  }
  // Balance des blancs : le papier (blocs les plus clairs) doit devenir neutre.
  const ordre = Array.from(petit.keys()).sort((i, j) => petit[j] - petit[i]).slice(0, Math.max(1, Math.round(sw * sh * 0.15)));
  const moyenne = (t) => ordre.reduce((somme, i) => somme + t[i], 0) / ordre.length;
  const lumPapier = moyenne(petit);
  const balance = [lumPapier / Math.max(1, moyenne(rouge)), lumPapier / Math.max(1, moyenne(vert)), lumPapier / Math.max(1, moyenne(bleu))];
  const a = new Float32Array(sw * sh);
  const b = new Float32Array(sw * sh);
  dilater(petit, a, sw, sh, 2);
  const rayon = Math.max(4, Math.round(Math.min(sw, sh) / 12));
  for (let passe = 0; passe < 2; passe++) {
    flouHorizontal(a, b, sw, sh, rayon);
    flouVertical(b, a, sw, sh, rayon);
  }
  return { carte: a, sw, sh, balance };
}

function netteteter(canvas, quantite) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const copie = new Uint8ClampedArray(d);
  const a = quantite / 100;
  const centre = 1 + 4 * a;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        d[i + c] = copie[i + c] * centre - a * (copie[i + c - 4] + copie[i + c + 4] + copie[i + c - w * 4] + copie[i + c + w * 4]);
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}

function tourner(canvas, degres) {
  const angle = ((degres % 360) + 360) % 360;
  if (!angle) return canvas;
  const sortie = document.createElement("canvas");
  const quart = angle === 90 || angle === 270;
  sortie.width = quart ? canvas.height : canvas.width;
  sortie.height = quart ? canvas.width : canvas.height;
  const ctx = sortie.getContext("2d");
  ctx.translate(sortie.width / 2, sortie.height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return sortie;
}

// `source` : canvas déjà redressé. Renvoie un NOUVEAU canvas retouché.
export function appliquer(source, reglages) {
  const { filtre, luminosite, contraste, nettete, rotation } = reglages;
  const w = source.width;
  const h = source.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;

  const facteur = 1 + contraste / 100;
  const decalage = luminosite * 1.28;
  const lut = new Uint8ClampedArray(256);
  const lutGamma = new Float32Array(256);
  for (let v = 0; v < 256; v++) lutGamma[v] = 255 * (v / 255) ** GAMMA_DOCUMENT;
  for (let v = 0; v < 256; v++) lut[v] = (v - 128) * facteur + 128 + decalage;

  if (filtre === "original") {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = lut[d[i]];
      d[i + 1] = lut[d[i + 1]];
      d[i + 2] = lut[d[i + 2]];
    }
  } else {
    const { carte, sw, sh, balance } = estimerFond(d, w, h);
    const x0 = new Int32Array(w);
    const x1 = new Int32Array(w);
    const wx = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) / BLOC - 0.5));
      x0[x] = Math.floor(fx);
      x1[x] = Math.min(sw - 1, x0[x] + 1);
      wx[x] = fx - x0[x];
    }
    const seuil = 190 + luminosite * 0.6;
    const largeur = 30 / Math.max(0.3, facteur);
    for (let y = 0; y < h; y++) {
      const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) / BLOC - 0.5));
      const y0 = Math.floor(fy);
      const y1 = Math.min(sh - 1, y0 + 1);
      const wy = fy - y0;
      for (let x = 0; x < w; x++) {
        const fond = (1 - wy) * ((1 - wx[x]) * carte[y0 * sw + x0[x]] + wx[x] * carte[y0 * sw + x1[x]]) + wy * ((1 - wx[x]) * carte[y1 * sw + x0[x]] + wx[x] * carte[y1 * sw + x1[x]]);
        const k = 255 / Math.max(fond, 60);
        const i = (y * w + x) * 4;
        if (filtre === "nb" || filtre === "gris") {
          const lum = Math.min(255, (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) * k);
          if (filtre === "nb") {
            const t = Math.min(1, Math.max(0, (lum - (seuil - largeur)) / (2 * largeur)));
            d[i] = d[i + 1] = d[i + 2] = 255 * t * t * (3 - 2 * t);
          } else {
            d[i] = d[i + 1] = d[i + 2] = lut[lutGamma[lum | 0] | 0];
          }
        } else {
          d[i] = lut[lutGamma[Math.min(255, d[i] * k * balance[0]) | 0] | 0];
          d[i + 1] = lut[lutGamma[Math.min(255, d[i + 1] * k * balance[1]) | 0] | 0];
          d[i + 2] = lut[lutGamma[Math.min(255, d[i + 2] * k * balance[2]) | 0] | 0];
        }
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  if (nettete > 0) netteteter(canvas, nettete);
  return tourner(canvas, rotation);
}
