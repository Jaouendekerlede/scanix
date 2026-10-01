// Point d'entrée : branche les écrans sur le routeur et lance l'appli.

import * as accueil from "./accueil.js";
import * as camera from "./camera.js";
import * as document_ from "./document.js";
import * as editeur from "./editeur.js";
import { initialiserReglages } from "./reglages.js";
import { demarrer, enregistrer } from "./routeur.js";

enregistrer("accueil", accueil);
enregistrer("document", document_);
enregistrer("camera", camera);
enregistrer("editeur", editeur);

accueil.initialiserAccueil();
document_.initialiserDocument();
camera.initialiserCamera();
editeur.initialiserEditeur();
initialiserReglages();
demarrer();

const splash = document.getElementById("sx-splash");
splash.classList.add("fini");
setTimeout(() => splash.remove(), 500);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
