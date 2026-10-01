// Copie de l'appli pour un démarrage hors-ligne. Réseau d'abord (une mise à
// jour publiée est prise tout de suite), la copie ne sert que sans réseau.
// Les documents sont dans IndexedDB : rien d'autre à mettre en cache.

const CACHE_NOM = "scanix-v1";
const FICHIERS_COQUILLE = ["./", "./index.html", "./style.css", "./manifest.json", "./js/main.js", "./js/accueil.js", "./js/camera.js", "./js/document.js", "./js/editeur.js", "./js/reglages.js", "./js/routeur.js", "./js/pages.js", "./js/db.js", "./js/detection.js", "./js/filtres.js", "./js/geometrie.js", "./js/pdf.js", "./js/utils.js", "./js/config.js", "./js/mentions.js", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NOM)
      .then((cache) => cache.addAll(FICHIERS_COQUILLE.map((f) => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((noms) => Promise.all(noms.filter((n) => n.startsWith("scanix-v") && n !== CACHE_NOM).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request.url, { cache: "no-cache" })
      .then((reponse) => {
        if (reponse.ok) {
          const copie = reponse.clone();
          caches.open(CACHE_NOM).then((cache) => cache.put(event.request, copie));
        }
        return reponse;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match("./index.html"))),
  );
});
