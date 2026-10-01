// Écran caméra : on cadre le document, on appuie sur le déclencheur, et on
// peut enchaîner plusieurs pages sans quitter l'écran. Limite : sans la
// caméra du navigateur (autorisation refusée…), on propose l'appareil photo
// du téléphone ou la galerie.

import { creerDocument } from "./db.js";
import { ajouterPageDepuisCanvas, importerFichiers } from "./pages.js";
import { aller, retour } from "./routeur.js";
import { $, choisirFichiers, message, nomParDefaut, versCanvas } from "./utils.js";

let flux = null;
let docId = null;
let ajoutees = 0;
let occupe = false;

function majCompteur() {
  $("sx-cam-compte").textContent = ajoutees ? `${ajoutees} page${ajoutees > 1 ? "s" : ""}` : "";
  $("sx-cam-terminer").hidden = !ajoutees;
}

async function assurerDocument() {
  docId ??= (await creerDocument(nomParDefaut())).id;
  return docId;
}

function arreter() {
  flux?.getTracks().forEach((t) => t.stop());
  flux = null;
  $("sx-cam-video").srcObject = null;
}

async function declencher() {
  const video = $("sx-cam-video");
  if (occupe || !flux || !video.videoWidth) return;
  occupe = true;
  navigator.vibrate?.(30);
  $("sx-cam-flash").classList.add("actif");
  setTimeout(() => $("sx-cam-flash").classList.remove("actif"), 120);
  try {
    const photo = document.createElement("canvas");
    photo.width = video.videoWidth;
    photo.height = video.videoHeight;
    photo.getContext("2d").drawImage(video, 0, 0);
    await ajouterPageDepuisCanvas(await assurerDocument(), photo);
    ajoutees++;
    majCompteur();
  } catch (e) {
    message(`Photo impossible : ${e.message}`);
  } finally {
    occupe = false;
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

export function initialiserCamera() {
  $("sx-cam-declencheur").addEventListener("click", declencher);
  $("sx-cam-fermer").addEventListener("click", terminer);
  $("sx-cam-terminer").addEventListener("click", terminer);
  $("sx-cam-galerie").addEventListener("click", () => importer(false));
  $("sx-cam-natif").addEventListener("click", () => importer(true));
}

export async function afficher(params) {
  docId = params.docId ?? null;
  ajoutees = 0;
  occupe = false;
  majCompteur();
  $("sx-cam-erreur").hidden = true;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("caméra non disponible dans ce navigateur");
    flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
    const video = $("sx-cam-video");
    video.srcObject = flux;
    await video.play();
  } catch (e) {
    $("sx-cam-erreur").textContent = `Caméra indisponible (${e.message || e.name}). Autorise la caméra pour Scanix, ou utilise l'appareil photo du téléphone / la galerie ci-dessous.`;
    $("sx-cam-erreur").hidden = false;
  }
}

export function quitter() {
  arreter();
}
