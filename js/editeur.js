// Éditeur d'une page : trois onglets.
//  - Recadrer : on déplace les 4 coins sur la photo (avec une loupe), et on
//    peut forcer un format (A4, carte) ;
//  - Retoucher : filtre, luminosité, contraste, netteté, rotation, en direct ;
//  - Annoter : stylo, surligneur, texte, flou, signature.

import { COINS_DEFAUT, COTE_APERCU, COULEURS_ANNOT, FILTRES, FORMATS_CADRE, REGLAGES_DEFAUT } from "./config.js";
import { majPage, obtenirDocument, obtenirPage } from "./db.js";
import { detecter } from "./detection.js";
import { preparerAnnotations, versOrigine } from "./annotations.js";
import { detecterReflets, finaliser, traiter, tourner } from "./filtres.js";
import { redresser } from "./geometrie.js";
import { miniatureDe, retenirReglages } from "./pages.js";
import { ratioDe } from "./rendu.js";
import { signatureEnregistree, ouvrirSignature } from "./signature.js";
import { retour } from "./routeur.js";
import { $, blobVersCanvas, el, message, pause } from "./utils.js";

let page = null;
let source = null; // photo entière (canvas)
let coins = [];
let reglages = { ...REGLAGES_DEFAUT, annotations: [] };
let apercuRedresse = null; // redressé, taille d'aperçu (avant filtre)
let apercuTraite = null; // + filtre/réglages (avant annotations/rotation)
let onglet = "recadrer";
let modifie = false;
let imageEnAttente = false;
let numero = "";
let outilAnnot = "stylo";
let traitEnCours = null; // points du trait en cours (stylo/surligneur)

const poignees = [];

function tailleAffichage(w, h) {
  const maxW = $("sx-ed-scene").clientWidth || window.innerWidth - 24;
  const maxH = Math.max(240, window.innerHeight * 0.5);
  const e = Math.min(maxW / w, maxH / h);
  return { largeur: Math.round(w * e), hauteur: Math.round(h * e) };
}

function dessinerDansCanvas(canvas, image, largeur, hauteur) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(largeur * dpr);
  canvas.height = Math.round(hauteur * dpr);
  canvas.style.width = `${largeur}px`;
  canvas.style.height = `${hauteur}px`;
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  $("sx-ed-zone").style.width = `${largeur}px`;
  $("sx-ed-zone").style.height = `${hauteur}px`;
}

function majCadre() {
  const zone = $("sx-ed-zone");
  const l = zone.clientWidth;
  const h = zone.clientHeight;
  $("sx-ed-polygone").setAttribute("points", coins.map((c) => `${c.x * l},${c.y * h}`).join(" "));
  $("sx-ed-svg").setAttribute("viewBox", `0 0 ${l} ${h}`);
  poignees.forEach((p, i) => {
    p.style.left = `${coins[i].x * l}px`;
    p.style.top = `${coins[i].y * h}px`;
  });
}

function afficherLoupe(i, visible) {
  const loupe = $("sx-ed-loupe");
  loupe.hidden = !visible;
  if (!visible) return;
  const c = coins[i];
  const taille = 110;
  const zoneSource = 60;
  loupe.width = taille;
  loupe.height = taille;
  const ctx = loupe.getContext("2d");
  ctx.clearRect(0, 0, taille, taille);
  ctx.drawImage(source, c.x * source.width - zoneSource / 2, c.y * source.height - zoneSource / 2, zoneSource, zoneSource, 0, 0, taille, taille);
  ctx.strokeStyle = "#2dd4bf";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(taille / 2, 0);
  ctx.lineTo(taille / 2, taille);
  ctx.moveTo(0, taille / 2);
  ctx.lineTo(taille, taille / 2);
  ctx.stroke();
  loupe.style.left = c.x > 0.5 ? "6px" : "auto";
  loupe.style.right = c.x > 0.5 ? "auto" : "6px";
}

function creerPoignees() {
  const conteneur = $("sx-ed-poignees");
  conteneur.replaceChildren();
  poignees.length = 0;
  for (let i = 0; i < 4; i++) {
    const p = el("div", "sx-poignee");
    p.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try {
        p.setPointerCapture(e.pointerId);
      } catch {
        // Capture refusée (rare) : le glissé continue quand même via les écouteurs globaux.
      }
      p.classList.add("actif");
      afficherLoupe(i, true);
    });
    p.addEventListener("pointermove", (e) => {
      if (!p.hasPointerCapture(e.pointerId)) return;
      const r = $("sx-ed-zone").getBoundingClientRect();
      coins[i] = { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
      modifie = true;
      apercuRedresse = null;
      majCadre();
      afficherLoupe(i, true);
    });
    const fin = () => {
      p.classList.remove("actif");
      afficherLoupe(i, false);
    };
    p.addEventListener("pointerup", fin);
    p.addEventListener("pointercancel", fin);
    conteneur.append(p);
    poignees.push(p);
  }
}

function afficherRecadrage() {
  const { largeur, hauteur } = tailleAffichage(source.width, source.height);
  dessinerDansCanvas($("sx-ed-canvas"), source, largeur, hauteur);
  $("sx-ed-cadre").hidden = false;
  majCadre();
}

// Image redressée + filtrée, SANS annotations ni rotation (base pour l'aperçu
// de retouche et pour dessiner les annotations par-dessus).
function baseTraitee() {
  apercuRedresse ??= redresser(source, coins, COTE_APERCU, ratioDe(reglages.format));
  apercuTraite ??= traiter(apercuRedresse, reglages);
  return apercuTraite;
}

async function afficherRetouche() {
  const resultat = finaliser(baseTraitee(), [], reglages.rotation);
  const { largeur, hauteur } = tailleAffichage(resultat.width, resultat.height);
  dessinerDansCanvas($("sx-ed-canvas"), resultat, largeur, hauteur);
  $("sx-ed-cadre").hidden = true;
}

async function afficherAnnoter() {
  await preparerAnnotations(reglages.annotations);
  const tournee = tourner(baseTraitee(), reglages.rotation);
  const resultat = document.createElement("canvas");
  resultat.width = tournee.width;
  resultat.height = tournee.height;
  const ctx = resultat.getContext("2d");
  ctx.drawImage(tournee, 0, 0);
  const { dessinerAnnotations } = await import("./annotations.js");
  dessinerAnnotations(resultat, reglages.annotations);
  const { largeur, hauteur } = tailleAffichage(resultat.width, resultat.height);
  dessinerDansCanvas($("sx-ed-canvas"), resultat, largeur, hauteur);
  $("sx-ed-cadre").hidden = true;
}

function planifierRendu() {
  if (imageEnAttente) return;
  imageEnAttente = true;
  requestAnimationFrame(async () => {
    imageEnAttente = false;
    if (onglet === "retoucher") afficherRetouche();
    else if (onglet === "annoter") afficherAnnoter();
  });
}

function majControlesRetouche() {
  $("sx-ed-lum").value = reglages.luminosite;
  $("sx-ed-contr").value = reglages.contraste;
  $("sx-ed-nett").value = reglages.nettete;
  $("sx-ed-lum-val").textContent = reglages.luminosite;
  $("sx-ed-contr-val").textContent = reglages.contraste;
  $("sx-ed-nett-val").textContent = reglages.nettete;
  document.querySelectorAll("#sx-ed-filtres button").forEach((b) => b.classList.toggle("actif", b.dataset.filtre === reglages.filtre));
}

function majControlesFormat() {
  document.querySelectorAll("#sx-ed-formats button").forEach((b) => b.classList.toggle("actif", b.dataset.format === reglages.format));
}

async function choisirOnglet(nom) {
  onglet = nom;
  $("sx-ed-onglet-recadrer").classList.toggle("actif", nom === "recadrer");
  $("sx-ed-onglet-retoucher").classList.toggle("actif", nom === "retoucher");
  $("sx-ed-onglet-annoter").classList.toggle("actif", nom === "annoter");
  $("sx-ed-panneau-recadrer").hidden = nom !== "recadrer";
  $("sx-ed-panneau-retoucher").hidden = nom !== "retoucher";
  $("sx-ed-panneau-annoter").hidden = nom !== "annoter";
  $("sx-ed-zone-annot").style.pointerEvents = nom === "annoter" ? "auto" : "none";
  if (nom === "recadrer") afficherRecadrage();
  else if (nom === "retoucher") await afficherRetouche();
  else await afficherAnnoter();
}

// Position normalisée (0..1) d'un pointeur sur l'image AFFICHÉE, puis ramenée
// à l'image avant rotation (c'est là que les annotations sont stockées).
function positionAnnotation(e) {
  const r = $("sx-ed-zone").getBoundingClientRect();
  const u = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const v = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  const [x, y] = versOrigine(u, v, reglages.rotation);
  return [x, y];
}

function commencerTrait(e) {
  if (outilAnnot !== "stylo" && outilAnnot !== "surligneur") return;
  traitEnCours = { type: outilAnnot, couleur: $("sx-ed-couleur").value, epaisseur: outilAnnot === "stylo" ? 0.006 : 0.022, points: [positionAnnotation(e)] };
  reglages.annotations.push(traitEnCours);
  modifie = true;
}

function continuerTrait(e) {
  if (!traitEnCours) return;
  traitEnCours.points.push(positionAnnotation(e));
  planifierRendu();
}

function finirTrait() {
  traitEnCours = null;
}

async function toucherZone(e) {
  if (outilAnnot === "texte") {
    const texte = prompt("Texte à ajouter :")?.trim();
    if (!texte) return;
    const [x, y] = positionAnnotation(e);
    reglages.annotations.push({ type: "texte", texte, x, y, taille: 0.035, couleur: $("sx-ed-couleur").value });
    modifie = true;
    planifierRendu();
  } else if (outilAnnot === "flou") {
    const [x, y] = positionAnnotation(e);
    reglages.annotations.push({ type: "flou", x: x - 0.1, y: y - 0.04, l: 0.2, h: 0.08 });
    modifie = true;
    planifierRendu();
    message("Zone floutée ajoutée : glisse-la ou agrandis-la si besoin depuis « Annuler » puis en la refaisant.");
  } else if (outilAnnot === "signature") {
    const image = await signatureEnregistree();
    if (!image) return message("Crée d'abord ta signature avec « ✍️ Ma signature ».");
    const [x, y] = positionAnnotation(e);
    reglages.annotations.push({ type: "signature", image, x, y, l: 0.3, ratio: 0.4 });
    modifie = true;
    planifierRendu();
  }
}

function annulerDerniereAnnotation() {
  reglages.annotations.pop();
  modifie = true;
  planifierRendu();
}

async function enregistrer() {
  $("sx-ed-enregistrer").disabled = true;
  try {
    const nouvellePage = { ...page, coins, reglages };
    const miniature = await miniatureDe(source, nouvellePage);
    await majPage({ ...nouvellePage, miniature });
    retenirReglages(reglages);
    modifie = false;
    retour();
  } catch (e) {
    message(`Enregistrement impossible : ${e.message}`);
  } finally {
    $("sx-ed-enregistrer").disabled = false;
  }
}

// Reprend filtre, luminosité, contraste, netteté et format sur toutes les pages du document.
async function appliquerATous() {
  const doc = await obtenirDocument(page.docId);
  const autres = doc.pages.filter((id) => id !== page.id);
  if (!autres.length) return message("Ce document n'a qu'une page.");
  if (!confirm(`Appliquer ces réglages aux ${autres.length} autres pages du document ?`)) return;
  const { filtre, luminosite, contraste, nettete, format } = reglages;
  for (let i = 0; i < autres.length; i++) {
    message(`Page ${i + 1}/${autres.length}…`, 60000);
    await pause();
    const p = await obtenirPage(autres[i]);
    const reglagesPage = { ...p.reglages, filtre, luminosite, contraste, nettete, format };
    const photo = await blobVersCanvas(p.source);
    const nouvellePage = { ...p, reglages: reglagesPage };
    await majPage({ ...nouvellePage, miniature: await miniatureDe(photo, nouvellePage) });
  }
  message("Réglages appliqués à toutes les pages.");
}

async function verifierReflets() {
  const resultat = traiter(redresser(source, coins, COTE_APERCU, ratioDe(reglages.format)), { ...reglages, filtre: "original" });
  if (detecterReflets(resultat)) message("💡 Reflet ou zone brûlée détecté(e) : incline légèrement le document ou déplace la lumière, puis reprends la photo si besoin.", 6000);
}

export function initialiserEditeur() {
  creerPoignees();
  const chipsFiltres = $("sx-ed-filtres");
  for (const f of FILTRES) {
    const b = el("button", "sx-puce", f.nom);
    b.type = "button";
    b.dataset.filtre = f.id;
    b.title = f.aide;
    b.addEventListener("click", () => {
      reglages.filtre = f.id;
      modifie = true;
      apercuTraite = null;
      majControlesRetouche();
      planifierRendu();
    });
    chipsFiltres.append(b);
  }
  const chipsFormats = $("sx-ed-formats");
  for (const [id, f] of Object.entries(FORMATS_CADRE)) {
    const b = el("button", "sx-puce", f.nom);
    b.type = "button";
    b.dataset.format = id;
    b.addEventListener("click", () => {
      reglages.format = id;
      modifie = true;
      apercuRedresse = null;
      apercuTraite = null;
      majControlesFormat();
      if (onglet === "recadrer") message(f.ratio ? `Le document sera redressé au format ${f.nom}.` : "Les proportions mesurées sur la photo seront gardées.");
    });
    chipsFormats.append(b);
  }
  for (const [id, cle] of [["sx-ed-lum", "luminosite"], ["sx-ed-contr", "contraste"], ["sx-ed-nett", "nettete"]]) {
    $(id).addEventListener("input", (e) => {
      reglages[cle] = Number(e.target.value);
      modifie = true;
      apercuTraite = null;
      $(`${id}-val`).textContent = reglages[cle];
      planifierRendu();
    });
  }
  $("sx-ed-rot-g").addEventListener("click", () => {
    reglages.rotation = (reglages.rotation + 270) % 360;
    modifie = true;
    planifierRendu();
  });
  $("sx-ed-rot-d").addEventListener("click", () => {
    reglages.rotation = (reglages.rotation + 90) % 360;
    modifie = true;
    planifierRendu();
  });
  $("sx-ed-reinit").addEventListener("click", () => {
    reglages = { ...REGLAGES_DEFAUT, rotation: reglages.rotation, format: reglages.format, annotations: reglages.annotations };
    modifie = true;
    apercuTraite = null;
    majControlesRetouche();
    planifierRendu();
  });
  $("sx-ed-toutes").addEventListener("click", appliquerATous);
  $("sx-ed-detecter").addEventListener("click", () => {
    const d = detecter(source);
    coins = d.coins;
    apercuRedresse = null;
    apercuTraite = null;
    modifie = true;
    majCadre();
    message(d.trouve ? "Bords détectés. Ajuste les coins si besoin." : "Bords non trouvés automatiquement : ajuste les coins à la main.");
  });
  $("sx-ed-entiere").addEventListener("click", () => {
    coins = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    apercuRedresse = null;
    apercuTraite = null;
    modifie = true;
    majCadre();
  });
  $("sx-ed-onglet-recadrer").addEventListener("click", () => choisirOnglet("recadrer"));
  $("sx-ed-onglet-retoucher").addEventListener("click", () => choisirOnglet("retoucher"));
  $("sx-ed-onglet-annoter").addEventListener("click", () => choisirOnglet("annoter"));
  $("sx-ed-enregistrer").addEventListener("click", enregistrer);
  $("sx-ed-retour").addEventListener("click", () => {
    if (!modifie || confirm("Abandonner les modifications de cette page ?")) retour();
  });

  // Outils d'annotation.
  for (const bouton of document.querySelectorAll("#sx-ed-outils button")) {
    bouton.addEventListener("click", () => {
      outilAnnot = bouton.dataset.outil;
      document.querySelectorAll("#sx-ed-outils button").forEach((b) => b.classList.toggle("actif", b === bouton));
      $("sx-ed-couleur-ligne").hidden = !["stylo", "surligneur", "texte"].includes(outilAnnot);
      if (outilAnnot === "signature") ouvrirSignature();
    });
  }
  for (const c of COULEURS_ANNOT) {
    const b = el("button", "");
    b.type = "button";
    b.style.setProperty("--c", c);
    b.classList.add("sx-couleur-pastille");
    b.addEventListener("click", () => {
      $("sx-ed-couleur").value = c;
      document.querySelectorAll(".sx-couleur-pastille").forEach((x) => x.classList.toggle("actif", x === b));
    });
    $("sx-ed-couleurs").append(b);
  }
  $("sx-ed-couleur").value = COULEURS_ANNOT[0];
  document.querySelector(".sx-couleur-pastille")?.classList.add("actif");
  $("sx-ed-annuler-annot").addEventListener("click", annulerDerniereAnnotation);
  const zone = $("sx-ed-zone-annot");
  zone.addEventListener("pointerdown", (e) => {
    try {
      zone.setPointerCapture(e.pointerId);
    } catch {
      // Capture refusée (rare) : le dessin continue quand même.
    }
    if (outilAnnot === "stylo" || outilAnnot === "surligneur") commencerTrait(e);
  });
  zone.addEventListener("pointermove", continuerTrait);
  zone.addEventListener("pointerup", (e) => {
    finirTrait();
    if (outilAnnot !== "stylo" && outilAnnot !== "surligneur") toucherZone(e);
  });

  window.addEventListener("resize", () => {
    if (page && !$("sx-v-editeur").hidden) choisirOnglet(onglet);
  });
}

export async function afficher({ pageId, numero: n }) {
  numero = n ?? "";
  page = await obtenirPage(pageId);
  if (!page) return retour();
  source = await blobVersCanvas(page.source);
  coins = page.coins?.length === 4 ? page.coins.map((c) => ({ ...c })) : COINS_DEFAUT.map((c) => ({ ...c }));
  reglages = { ...REGLAGES_DEFAUT, ...page.reglages, annotations: (page.annotations ?? []).map((a) => ({ ...a, points: a.points ? a.points.map((p) => [...p]) : undefined })) };
  apercuRedresse = null;
  apercuTraite = null;
  modifie = false;
  outilAnnot = "stylo";
  document.querySelector('#sx-ed-outils [data-outil="stylo"]')?.click();
  $("sx-ed-titre").textContent = numero ? `Page ${numero}` : "Page";
  majControlesRetouche();
  majControlesFormat();
  await choisirOnglet("recadrer");
  verifierReflets();
}

export function quitter() {
  page = null;
  source = null;
  apercuRedresse = null;
  apercuTraite = null;
}
