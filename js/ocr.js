// Reconnaissance de texte (OCR) avec Tesseract, gratuit et 100 % local : les
// fichiers (~9 Mo : moteur + langue française) sont dans le dépôt (js/vendor/ocr)
// et ne sont chargés qu'au premier usage. Limites : lent sur téléphone
// (quelques secondes à une trentaine de secondes par page), moins fiable sur
// l'écriture manuscrite ou les photos floues. Seul le français est inclus.

import { chargerScript } from "./chargeur.js";

let promesseWorker = null;
let progresCourant = () => {};

async function obtenirWorker() {
  promesseWorker ??= (async () => {
    await chargerScript("js/vendor/ocr/tesseract.min.js");
    const base = new URL("js/vendor/ocr/", location.href).href;
    return window.Tesseract.createWorker("fra", 1, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: base,
      logger: (m) => progresCourant(m),
    });
  })().catch((e) => {
    promesseWorker = null;
    throw e;
  });
  return promesseWorker;
}

// Lit le texte d'un canvas. Renvoie { texte, mots: [{ t, x, y, l, h }] } avec
// des positions normalisées (0..1) par rapport à l'image.
// `onProgres(0..1, étape)` informe de l'avancement.
export async function reconnaitre(canvas, onProgres = () => {}) {
  progresCourant = (m) => {
    if (m.status === "recognizing text") onProgres(m.progress, "Lecture du texte");
    else if (m.status?.includes("loading")) onProgres(0, "Chargement du moteur (première fois)");
  };
  const worker = await obtenirWorker();
  const { data } = await worker.recognize(canvas, {}, { blocks: true });
  const w = canvas.width;
  const h = canvas.height;
  const mots = [];
  const parcourir = (liste) => {
    for (const mot of liste ?? []) {
      const texte = (mot.text ?? "").trim();
      if (texte && mot.confidence > 20) mots.push({ t: texte, x: mot.bbox.x0 / w, y: mot.bbox.y0 / h, l: (mot.bbox.x1 - mot.bbox.x0) / w, h: (mot.bbox.y1 - mot.bbox.y0) / h });
    }
  };
  if (data.words) parcourir(data.words);
  else for (const b of data.blocks ?? []) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) parcourir(l.words);
  return { texte: (data.text ?? "").trim(), mots };
}
