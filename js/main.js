// Point d'entrée : thème, branche les écrans sur le routeur, reprend une
// éventuelle image reçue par « Partager vers Scanix », puis lance l'appli.

import * as accueil from "./accueil.js";
import * as camera from "./camera.js";
import * as document_ from "./document.js";
import * as editeur from "./editeur.js";
import { initialiserReglages } from "./reglages.js";
import { ajouterPageDepuisCanvas } from "./pages.js";
import { creerDocument } from "./db.js";
import { aller, demarrer, enregistrer } from "./routeur.js";
import { appliquerTheme } from "./theme.js";
import { ouvrirImage, versCanvas } from "./utils.js";

appliquerTheme();

enregistrer("accueil", accueil);
enregistrer("document", document_);
enregistrer("camera", camera);
enregistrer("editeur", editeur);

accueil.initialiserAccueil();
document_.initialiserDocument();
camera.initialiserCamera();
editeur.initialiserEditeur();
initialiserReglages();

// Image(s) envoyée(s) par le menu Partager du téléphone : le service worker
// les a rangées dans un cache, on les reprend ici pour créer un document.
async function recupererPartage() {
  if (!location.search.includes("partage=1")) return false;
  history.replaceState(null, "", location.pathname);
  try {
    const cache = await caches.open("scanix-partage");
    const requetes = await cache.keys();
    if (!requetes.length) return false;
    const doc = await creerDocument(new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " (partagé)");
    for (const requete of requetes) {
      const blob = await (await cache.match(requete)).blob();
      await cache.delete(requete);
      try {
        const image = await ouvrirImage(blob);
        await ajouterPageDepuisCanvas(doc.id, versCanvas(image, 2400));
        image.close?.();
      } catch {
        // Fichier illisible : on passe au suivant.
      }
    }
    aller("document", { id: doc.id }, true);
    return true;
  } catch {
    return false;
  }
}

demarrer();
recupererPartage();

const splash = document.getElementById("sx-splash");
splash.classList.add("fini");
setTimeout(() => splash.remove(), 500);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
