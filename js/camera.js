// Écran caméra : on cadre le document, on appuie sur le déclencheur (ou on
// laisse la capture automatique se déclencher), et on peut enchaîner plusieurs
// pages sans quitter l'écran. Un cadre affiche en direct les bords détectés.
// Limite : sans la caméra du navigateur (autorisation refusée…), on propose
// l'appareil photo du téléphone ou la galerie.

import { MESURES_STABLES } from "./config.js";
import { creerDocument } from "./db.js";
import { detecter } from "./detection.js";
import { lirePrefs, sauverPrefs } from "./prefs.js";
import { ajouterPageDepuisCanvas, importerFichiers } from "./pages.js";
import { aller, retour } from "./routeur.js";
import { $, choisirFichiers, el, message, nomParDefaut, versCanvas } from "./utils.js";

let flux = null;
let piste = null;
let docId = null;
let ajoutees = 0;
let occupe = false;
let modeCarte = false;
let autoActif = false;
let torcheDispo = false;
let torcheActive = false;
let boucle = 0;
let stableDepuis = 0;
let dernierCadre = null;
let sonCtx = null;

function jouerSon() {
  try {
    sonCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const osc = sonCtx.createOscillator();
    const gain = sonCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.18, sonCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, sonCtx.currentTime + 0.12);
    osc.connect(gain).connect(sonCtx.destination);
    osc.start();
    osc.stop(sonCtx.currentTime + 0.13);
  } catch {
    // Audio indisponible : tant pis, la vibration et le flash visuel suffisent.
  }
}

function majCompteur() {
  $("sx-cam-compte").textContent = ajoutees ? `${ajoutees} page${ajoutees > 1 ? "s" : ""}` : "";
  $("sx-cam-terminer").hidden = !ajoutees;
}

async function assurerDocument() {
  docId ??= (await creerDocument(nomParDefaut())).id;
  return docId;
}

function arreter() {
  clearInterval(boucle);
  flux?.getTracks().forEach((t) => t.stop());
  flux = null;
  piste = null;
  $("sx-cam-video").srcObject = null;
}

function dessinerGuide(detection) {
  const svg = $("sx-cam-guide");
  const video = $("sx-cam-video");
  const r = video.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
  if (!detection) {
    svg.querySelector("polygon").setAttribute("points", "");
    return;
  }
  svg.querySelector("polygon").setAttribute("points", detection.coins.map((c) => `${c.x * r.width},${c.y * r.height}`).join(" "));
  svg.querySelector("polygon").classList.toggle("sx-guide-ok", detection.trouve);
}

async function capturerPhoto() {
  const video = $("sx-cam-video");
  const photo = document.createElement("canvas");
  photo.width = video.videoWidth;
  photo.height = video.videoHeight;
  photo.getContext("2d").drawImage(video, 0, 0);
  return photo;
}

async function enregistrerPage(photo, coins) {
  occupe = true;
  try {
    await ajouterPageDepuisCanvas(await assurerDocument(), photo, { coins, format: modeCarte ? "carte" : undefined });
    ajoutees++;
    majCompteur();
    navigator.vibrate?.(30);
    jouerSon();
    $("sx-cam-flash").classList.add("actif");
    setTimeout(() => $("sx-cam-flash").classList.remove("actif"), 120);
  } catch (e) {
    message(`Photo impossible : ${e.message}`);
  } finally {
    occupe = false;
    stableDepuis = 0;
  }
}

async function declencher() {
  const video = $("sx-cam-video");
  if (occupe || !flux || !video.videoWidth) return;
  await enregistrerPage(await capturerPhoto());
}

// Boucle de détection en direct : dessine le guide et, en mode auto, déclenche
// quand le cadrage reste stable plusieurs mesures de suite. Un intervalle fixe
// (pas requestAnimationFrame, qui irait jusqu'à 120 mesures/seconde sur
// certains téléphones) : la détection a un coût, et « stable » doit se compter
// en temps réel, pas en nombre d'images affichées.
const DELAI_MESURE_MS = 300;

async function analyser() {
  const video = $("sx-cam-video");
  if (!video.videoWidth || occupe) return;
  const petite = versCanvas(video, 220);
  const detection = detecter(petite);
  dessinerGuide(detection);
  if (autoActif && detection.trouve) {
    const bouge = dernierCadre && detection.coins.some((c, i) => Math.hypot(c.x - dernierCadre[i].x, c.y - dernierCadre[i].y) > 0.02);
    stableDepuis = bouge ? 1 : stableDepuis + 1;
    dernierCadre = detection.coins;
    $("sx-cam-auto-jauge").style.setProperty("--p", `${Math.min(1, stableDepuis / MESURES_STABLES) * 100}%`);
    if (stableDepuis >= MESURES_STABLES) {
      stableDepuis = 0;
      enregistrerPage(await capturerPhoto(), detection.coins);
    }
  } else {
    stableDepuis = 0;
    dernierCadre = null;
    $("sx-cam-auto-jauge").style.setProperty("--p", "0%");
  }
}

async function importer(capture) {
  const fichiers = await choisirFichiers({ capture });
  if (!fichiers.length) return;
  const id = await assurerDocument();
  ajoutees += await importerFichiers(id, fichiers, (i, n) => message(`Import ${i}/${n}…`, 60000));
  message("Import terminé.");
  majCompteur();
}

function terminer() {
  arreter();
  if (docId && ajoutees) aller("document", { id: docId }, true);
  else retour();
}

async function basculerTorche() {
  if (!piste || !torcheDispo) return;
  torcheActive = !torcheActive;
  try {
    await piste.applyConstraints({ advanced: [{ torch: torcheActive }] });
    $("sx-cam-torche").classList.toggle("actif", torcheActive);
  } catch {
    torcheActive = false;
    message("Lampe torche indisponible sur cet appareil.");
  }
}

function basculerAuto() {
  autoActif = !autoActif;
  stableDepuis = 0;
  $("sx-cam-auto").classList.toggle("actif", autoActif);
  $("sx-cam-auto-jauge").hidden = !autoActif;
  sauverPrefs({ captureAuto: autoActif });
}

function basculerCarte() {
  modeCarte = !modeCarte;
  $("sx-cam-carte").classList.toggle("actif", modeCarte);
  $("sx-cam-guide-zone").classList.toggle("sx-guide-carte", modeCarte);
}

export function initialiserCamera() {
  $("sx-cam-declencheur").addEventListener("click", declencher);
  $("sx-cam-fermer").addEventListener("click", terminer);
  $("sx-cam-terminer").addEventListener("click", terminer);
  $("sx-cam-galerie").addEventListener("click", () => importer(false));
  $("sx-cam-natif").addEventListener("click", () => importer(true));
  $("sx-cam-torche").addEventListener("click", basculerTorche);
  $("sx-cam-auto").addEventListener("click", basculerAuto);
  $("sx-cam-carte").addEventListener("click", basculerCarte);
}

export async function afficher(params) {
  docId = params.docId ?? null;
  ajoutees = 0;
  occupe = false;
  modeCarte = false;
  stableDepuis = 0;
  dernierCadre = null;
  autoActif = !!lirePrefs().captureAuto;
  majCompteur();
  $("sx-cam-erreur").hidden = true;
  $("sx-cam-auto").classList.toggle("actif", autoActif);
  $("sx-cam-auto-jauge").hidden = !autoActif;
  $("sx-cam-carte").classList.remove("actif");
  $("sx-cam-guide-zone").classList.remove("sx-guide-carte");
  $("sx-cam-torche").hidden = true;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("caméra non disponible dans ce navigateur");
    flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
    piste = flux.getVideoTracks()[0];
    torcheDispo = !!piste.getCapabilities?.().torch;
    $("sx-cam-torche").hidden = !torcheDispo;
    const video = $("sx-cam-video");
    video.srcObject = flux;
    await video.play();
    boucle = setInterval(analyser, DELAI_MESURE_MS);
  } catch (e) {
    $("sx-cam-erreur").textContent = `Caméra indisponible (${e.message || e.name}). Autorise la caméra pour Scanix, ou utilise l'appareil photo du téléphone / la galerie ci-dessous.`;
    $("sx-cam-erreur").hidden = false;
  }
}

export function quitter() {
  arreter();
}
