// Redressement en perspective : on transforme le quadrilatère du document
// (4 coins repérés sur la photo) en un rectangle bien droit, comme le fait un
// scanner. Calcul à la main (homographie), sans bibliothèque.

// Résolution d'un système linéaire par élimination de Gauss (pivot partiel).
function resoudre(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let max = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[max][i])) max = k;
    [A[i], A[max]] = [A[max], A[i]];
    [b[i], b[max]] = [b[max], b[i]];
    for (let k = i + 1; k < n; k++) {
      const f = A[k][i] / A[i][i];
      for (let j = i; j < n; j++) A[k][j] -= f * A[i][j];
      b[k] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  return x;
}

// Coefficients h0..h7 tels que (u,v) du rectangle de sortie -> (x,y) de la photo.
function homographie(sortie, source) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = sortie[i];
    const { x, y } = source[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }
  return resoudre(A, b);
}

// `coins` : 4 points normalisés (0..1) dans l'ordre haut-gauche, haut-droite,
// bas-droite, bas-gauche. `coteMax` : taille maximale du grand côté du résultat.
export function redresser(source, coins, coteMax) {
  const sw = source.width;
  const sh = source.height;
  const p = coins.map((c) => ({ x: c.x * sw, y: c.y * sh }));
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let w = Math.max(d(p[0], p[1]), d(p[3], p[2]));
  let h = Math.max(d(p[0], p[3]), d(p[1], p[2]));
  const echelle = Math.min(1, coteMax / Math.max(w, h));
  w = Math.max(1, Math.round(w * echelle));
  h = Math.max(1, Math.round(h * echelle));

  const sortie = document.createElement("canvas");
  sortie.width = w;
  sortie.height = h;
  const ctx = sortie.getContext("2d");

  // Cadre déjà droit : un simple recadrage suffit (rapide).
  const droit = Math.abs(p[0].x - p[3].x) < 1 && Math.abs(p[1].x - p[2].x) < 1 && Math.abs(p[0].y - p[1].y) < 1 && Math.abs(p[3].y - p[2].y) < 1;
  if (droit && p[1].x - p[0].x > 1 && p[3].y - p[0].y > 1) {
    ctx.drawImage(source, p[0].x, p[0].y, p[1].x - p[0].x, p[3].y - p[0].y, 0, 0, w, h);
    return sortie;
  }

  const tmp = document.createElement("canvas");
  tmp.width = sw;
  tmp.height = sh;
  const tctx = tmp.getContext("2d", { willReadFrequently: true });
  tctx.drawImage(source, 0, 0);
  const s = tctx.getImageData(0, 0, sw, sh).data;

  const H = homographie([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], p);
  const image = ctx.createImageData(w, h);
  const o = image.data;
  const maxX = sw - 1;
  const maxY = sh - 1;
  let k = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const den = H[6] * x + H[7] * y + 1;
      const sx = (H[0] * x + H[1] * y + H[2]) / den;
      const sy = (H[3] * x + H[4] * y + H[5]) / den;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const xa = x0 < 0 ? 0 : x0 > maxX ? maxX : x0;
      const xb = x0 + 1 < 0 ? 0 : x0 + 1 > maxX ? maxX : x0 + 1;
      const ya = y0 < 0 ? 0 : y0 > maxY ? maxY : y0;
      const yb = y0 + 1 < 0 ? 0 : y0 + 1 > maxY ? maxY : y0 + 1;
      const i00 = (ya * sw + xa) * 4;
      const i10 = (ya * sw + xb) * 4;
      const i01 = (yb * sw + xa) * 4;
      const i11 = (yb * sw + xb) * 4;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      o[k] = s[i00] * w00 + s[i10] * w10 + s[i01] * w01 + s[i11] * w11;
      o[k + 1] = s[i00 + 1] * w00 + s[i10 + 1] * w10 + s[i01 + 1] * w01 + s[i11 + 1] * w11;
      o[k + 2] = s[i00 + 2] * w00 + s[i10 + 2] * w10 + s[i01 + 2] * w01 + s[i11 + 2] * w11;
      o[k + 3] = 255;
      k += 4;
    }
  }
  ctx.putImageData(image, 0, 0);
  return sortie;
}
