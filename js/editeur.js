// Éditeur d'une page : deux onglets.
//  - Recadrer : on déplace les 4 coins sur la photo (avec une loupe) ;
//  - Retoucher : filtre, luminosité, contraste, netteté, rotation, en direct.

import { COINS_DEFAUT, COTE_APERCU, FILTRES, REGLAGES_DEFAUT } from "./config.js";
import { majPage, obtenirDocument, obtenirPage } from "./db.js";
import { detecterCoins } from "./detection.js";
import { appliquer } from "./filtres.js";
import { redresser } from "./geometrie.js";
import { miniatureDe, retenirReglages } from "./pages.js";
import { retour } from "./routeur.js";
import { $, blobVersCanvas, el, message, pause } from "./utils.js";

let page = null;
let source = null; // photo entière (canvas)
let coins = [];
let reglages = { ...REGLAGES_DEFAUT };
let apercu = null; // photo redressée en taille d'aperçu, recalculée si le cadre change
let onglet = "recadrer";
let modifie = false;
let imageEnAttente = false;
let numero = "";

const poignees = [];

// Taille d'affichage : le plus grand possible dans la zone disponible.
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
  const zoneSource = 60; // pixels de la photo visibles dans la loupe
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
  // La loupe se place du côté opposé au doigt pour ne pas être cachée.
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
      p.setPointerCapture(e.pointerId);
      p.classList.add("actif");
      afficherLoupe(i, true);
    });
    p.addEventListener("pointermove", (e) => {
      if (!p.hasPointerCapture(e.pointerId)) return;
      const r = $("sx-ed-zone").getBoundingClientRect();
      coins[i] = { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
      modifie = true;
      apercu = null;
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

function afficherRetouche() {
  apercu ??= redresser(source, coins, COTE_APERCU);
  const resultat = appliquer(apercu, reglages);
  const { largeur, hauteur } = tailleAffichage(resultat.width, resultat.height);
  dessinerDansCanvas($("sx-ed-canvas"), resultat, largeur, hauteur);
  $("sx-ed-cadre").hidden = true;
}

// Plusieurs mouvements de curseur dans la même image : un seul calcul.
function planifierRetouche() {
  if (imageEnAttente) return;
  imageEnAttente = true;
  requestAnimationFrame(() => {
    imageEnAttente = false;
    if (onglet === "retoucher") afficherRetouche();
  });
}

function majControles() {
  $("sx-ed-lum").value = reglages.luminosite;
  $("sx-ed-contr").value = reglages.contraste;
  $("sx-ed-nett").value = reglages.nettete;
  $("sx-ed-lum-val").textContent = reglages.luminosite;
  $("sx-ed-contr-val").textContent = reglages.contraste;
  $("sx-ed-nett-val").textContent = reglages.nettete;
  document.querySelectorAll("#sx-ed-filtres button").forEach((b) => b.classList.toggle("actif", b.dataset.filtre === reglages.filtre));
}

function choisirOnglet(nom) {
  onglet = nom;
  $("sx-ed-onglet-recadrer").classList.toggle("actif", nom === "recadrer");
  $("sx-ed-onglet-retoucher").classList.toggle("actif", nom === "retoucher");
  $("sx-ed-panneau-recadrer").hidden = nom !== "recadrer";
  $("sx-ed-panneau-retoucher").hidden = nom !== "retoucher";
  if (nom === "recadrer") afficherRecadrage();
  else afficherRetouche();
}

async function enregistrer() {
  $("sx-ed-enregistrer").disabled = true;
  try {
    const miniature = await miniatureDe(source, coins, reglages);
    await majPage({ ...page, coins, reglages, miniature });
    retenirReglages(reglages);
    modifie = false;
    retour();
  } catch (e) {
    message(`Enregistrement impossible : ${e.message}`);
  } finally {
    $("sx-ed-enregistrer").disabled = false;
  }
}

// Reprend filtre, luminosité, contraste et netteté sur toutes les pages du document.
async function appliquerATous() {
  const doc = await obtenirDocument(page.docId);
  const autres = doc.pages.filter((id) => id !== page.id);
  if (!autres.length) return message("Ce document n'a qu'une page.");
  if (!confirm(`Appliquer ces réglages aux ${autres.length} autres pages du document ?`)) return;
  for (let i = 0; i < autres.length; i++) {
    message(`Page ${i + 1}/${autres.length}…`, 60000);
    await pause();
    const p = await obtenirPage(autres[i]);
    const reglagesPage = { ...reglages, rotation: p.reglages.rotation };
    const photo = await blobVersCanvas(p.source);
    await majPage({ ...p, reglages: reglagesPage, miniature: await miniatureDe(photo, p.coins, reglagesPage) });
  }
  message("Réglages appliqués à toutes les pages.");
}

export function initialiserEditeur() {
  creerPoignees();
  const chips = $("sx-ed-filtres");
  for (const f of FILTRES) {
    const b = el("button", "sx-puce", f.nom);
    b.type = "button";
    b.dataset.filtre = f.id;
    b.title = f.aide;
    b.addEventListener("click", () => {
      reglages.filtre = f.id;
      modifie = true;
      majControles();
      planifierRetouche();
    });
    chips.append(b);
  }
  for (const [id, cle] of [["sx-ed-lum", "luminosite"], ["sx-ed-contr", "contraste"], ["sx-ed-nett", "nettete"]]) {
    $(id).addEventListener("input", (e) => {
      reglages[cle] = Number(e.target.value);
      modifie = true;
      $(`${id}-val`).textContent = reglages[cle];
      planifierRetouche();
    });
  }
  $("sx-ed-rot-g").addEventListener("click", () => {
    reglages.rotation = (reglages.rotation + 270) % 360;
    modifie = true;
    planifierRetouche();
  });
  $("sx-ed-rot-d").addEventListener("click", () => {
    reglages.rotation = (reglages.rotation + 90) % 360;
    modifie = true;
    planifierRetouche();
  });
  $("sx-ed-reinit").addEventListener("click", () => {
    reglages = { ...REGLAGES_DEFAUT, rotation: reglages.rotation };
    modifie = true;
    majControles();
    planifierRetouche();
  });
  $("sx-ed-toutes").addEventListener("click", appliquerATous);
  $("sx-ed-detecter").addEventListener("click", () => {
    coins = detecterCoins(source);
    apercu = null;
    modifie = true;
    majCadre();
    message("Bords détectés. Ajuste les coins si besoin.");
  });
  $("sx-ed-entiere").addEventListener("click", () => {
    coins = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    apercu = null;
    modifie = true;
    majCadre();
  });
  $("sx-ed-onglet-recadrer").addEventListener("click", () => choisirOnglet("recadrer"));
  $("sx-ed-onglet-retoucher").addEventListener("click", () => choisirOnglet("retoucher"));
  $("sx-ed-enregistrer").addEventListener("click", enregistrer);
  $("sx-ed-retour").addEventListener("click", () => {
    if (!modifie || confirm("Abandonner les modifications de cette page ?")) retour();
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
  coins = page.coins.map((c) => ({ ...c }));
  if (coins.length !== 4) coins = COINS_DEFAUT.map((c) => ({ ...c }));
  reglages = { ...REGLAGES_DEFAUT, ...page.reglages };
  apercu = null;
  modifie = false;
  $("sx-ed-titre").textContent = numero ? `Page ${numero}` : "Page";
  majControles();
  choisirOnglet("recadrer");
}

export function quitter() {
  page = null;
  source = null;
  apercu = null;
}
