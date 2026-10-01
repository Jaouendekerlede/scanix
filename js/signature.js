// Signature manuscrite : dessinée une fois au doigt, gardée (en PNG, fond
// transparent) dans les préférences pour être replacée sur n'importe quelle page.

import { lirePrefs, sauverPrefs } from "./prefs.js";
import { $ } from "./utils.js";

let dessin = false;
let dernierPoint = null;

export function signatureEnregistree() {
  return lirePrefs().signature ?? null;
}

function position(e, canvas) {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height];
}

function effacer() {
  const canvas = $("sx-signature-canvas");
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

function enregistrerEtFermer() {
  const canvas = $("sx-signature-canvas");
  sauverPrefs({ signature: canvas.toDataURL("image/png") });
  $("sx-signature").close();
}

let initialise = false;
function initialiserUneFois() {
  if (initialise) return;
  initialise = true;
  const canvas = $("sx-signature-canvas");
  const dessiner = (e) => {
    const [x, y] = position(e, canvas);
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(...(dernierPoint ?? [x, y]));
    ctx.lineTo(x, y);
    ctx.stroke();
    dernierPoint = [x, y];
  };
  canvas.addEventListener("pointerdown", (e) => {
    dessin = true;
    dernierPoint = null;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture refusée (rare, selon le navigateur) : le dessin continue quand même.
    }
    dessiner(e);
  });
  canvas.addEventListener("pointermove", (e) => dessin && dessiner(e));
  canvas.addEventListener("pointerup", () => {
    dessin = false;
    dernierPoint = null;
  });
  $("sx-signature-effacer").addEventListener("click", effacer);
  $("sx-signature-annuler").addEventListener("click", () => $("sx-signature").close());
  $("sx-signature-valider").addEventListener("click", enregistrerEtFermer);
}

export function ouvrirSignature() {
  initialiserUneFois();
  $("sx-signature").showModal();
  // La boîte doit être affichée (showModal) avant de lire sa taille réelle :
  // sans ce délai, clientWidth/Height peuvent valoir 0 selon le navigateur,
  // ce qui rendrait le dessin invalide (canvas de taille nulle).
  requestAnimationFrame(() => {
    const canvas = $("sx-signature-canvas");
    canvas.width = Math.max(1, canvas.clientWidth) * 2;
    canvas.height = Math.max(1, canvas.clientHeight) * 2;
    effacer();
    const existante = signatureEnregistree();
    if (existante) {
      const img = new Image();
      img.onload = () => canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = existante;
    }
  });
}
