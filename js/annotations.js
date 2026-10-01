// Annotations d'une page : stylo, surligneur, texte, zone floutée, signature.
// Elles sont rangées avec la page sous forme de petits objets (pas de pixels),
// avec des positions normalisées (0..1) dans l'image redressée AVANT rotation,
// et des tailles relatives à la largeur de cette image : elles restent donc
// justes à toutes les résolutions (aperçu, miniature, export).
//   { type: "stylo" | "surligneur", couleur, epaisseur, points: [[x, y], …] }
//   { type: "texte", texte, x, y, taille, couleur }
//   { type: "flou", x, y, l, h }
//   { type: "signature", image (dataURL PNG), x, y, l, ratio }

const images = new Map();

// Décode d'avance les images des signatures (le dessin, lui, est synchrone).
export async function preparerAnnotations(liste = []) {
  await Promise.all(
    liste
      .filter((a) => a.type === "signature" && !images.has(a.image))
      .map(async (a) => {
        const img = new Image();
        img.src = a.image;
        await img.decode();
        images.set(a.image, img);
      }),
  );
}

function pixeliser(ctx, x, y, l, h) {
  x = Math.max(0, Math.floor(x));
  y = Math.max(0, Math.floor(y));
  l = Math.min(ctx.canvas.width - x, Math.ceil(l));
  h = Math.min(ctx.canvas.height - y, Math.ceil(h));
  if (l < 2 || h < 2) return;
  const bloc = Math.max(6, Math.round(ctx.canvas.width / 90));
  const petit = document.createElement("canvas");
  petit.width = Math.max(1, Math.round(l / bloc));
  petit.height = Math.max(1, Math.round(h / bloc));
  petit.getContext("2d").drawImage(ctx.canvas, x, y, l, h, 0, 0, petit.width, petit.height);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(petit, 0, 0, petit.width, petit.height, x, y, l, h);
  ctx.restore();
}

export function dessinerAnnotations(canvas, liste = []) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  for (const a of liste) {
    ctx.save();
    if (a.type === "stylo" || a.type === "surligneur") {
      if (!a.points.length) continue;
      ctx.strokeStyle = a.couleur;
      ctx.lineWidth = a.epaisseur * W;
      ctx.lineJoin = "round";
      ctx.lineCap = a.type === "stylo" ? "round" : "butt";
      if (a.type === "surligneur") {
        ctx.globalAlpha = 0.4;
        ctx.globalCompositeOperation = "multiply";
      }
      ctx.beginPath();
      a.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)));
      if (a.points.length === 1) ctx.lineTo(a.points[0][0] * W + 0.01, a.points[0][1] * H);
      ctx.stroke();
    } else if (a.type === "texte") {
      ctx.fillStyle = a.couleur;
      ctx.font = `600 ${a.taille * W}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(a.texte, a.x * W, a.y * H);
    } else if (a.type === "flou") {
      pixeliser(ctx, a.x * W, a.y * H, a.l * W, a.h * H);
    } else if (a.type === "signature") {
      const img = images.get(a.image);
      if (img) ctx.drawImage(img, (a.x - a.l / 2) * W, (a.y - (a.l * a.ratio * W) / H / 2) * H, a.l * W, a.l * a.ratio * W);
    }
    ctx.restore();
  }
}

// Passage d'un point (u, v) de l'image AFFICHÉE (déjà tournée) à l'image
// d'origine, avant rotation. `rotation` : 0, 90, 180 ou 270 (sens horaire).
export function versOrigine(u, v, rotation) {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return [v, 1 - u];
    case 180:
      return [1 - u, 1 - v];
    case 270:
      return [1 - v, u];
    default:
      return [u, v];
  }
}
