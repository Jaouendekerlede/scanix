// Copie de l'appli pour un démarrage hors-ligne. Réseau d'abord (une mise à
// jour publiée est prise tout de suite), la copie ne sert que sans réseau.
// Les documents sont dans IndexedDB : rien d'autre à mettre en cache.
// Les fichiers de reconnaissance de texte (js/vendor/ocr, ~9 Mo) ne sont PAS
// préchargés ici : ils sont mis en cache à leur première utilisation, pour ne
// pas alourdir l'installation de l'appli pour tout le monde.

const CACHE_NOM = "scanix-v2";
const FICHIERS_COQUILLE = ["./", "./index.html", "./style.css", "./manifest.json", "./js/main.js", "./js/accueil.js", "./js/camera.js", "./js/document.js", "./js/editeur.js", "./js/reglages.js", "./js/routeur.js", "./js/pages.js", "./js/db.js", "./js/detection.js", "./js/filtres.js", "./js/geometrie.js", "./js/pdf.js", "./js/pdf-crypto.js", "./js/utils.js", "./js/config.js", "./js/mentions.js", "./js/chargeur.js", "./js/prefs.js", "./js/theme.js", "./js/zip.js", "./js/sauvegarde.js", "./js/dossiers.js", "./js/annotations.js", "./js/signature.js", "./js/rendu.js", "./js/ocr.js", "./icons/icon-192.png", "./icons/icon-512.png"];

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

// Fichiers lourds (OCR) chargés à la demande : une fois récupérés, ils restent
// en cache indéfiniment (jamais purgés par une mise à jour de l'appli).
async function enCacheADemande(requete) {
  const cache = await caches.open("scanix-vendor");
  const trouve = await cache.match(requete);
  if (trouve) return trouve;
  const reponse = await fetch(requete);
  if (reponse.ok) await cache.put(requete, reponse.clone());
  return reponse;
}

// « Partager vers Scanix » (Android) : les images arrivent en POST ; on les
// range dans un cache le temps que l'appli les reprenne, puis on l'ouvre.
async function recevoirPartage(requete) {
  try {
    const champs = [...(await requete.formData()).getAll("images")];
    const cache = await caches.open("scanix-partage");
    let i = 0;
    for (const image of champs) if (image instanceof File) await cache.put(new URL(`image-${i++}`, self.registration.scope).href, new Response(image));
  } catch {
    // Partage illisible : l'appli s'ouvrira simplement sans image.
  }
  return Response.redirect(new URL("index.html?partage=1", self.registration.scope).href, 303);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.origin === self.location.origin && url.pathname.endsWith("/partage")) {
    event.respondWith(recevoirPartage(event.request));
    return;
  }
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.includes("/js/vendor/ocr/")) {
    event.respondWith(enCacheADemande(event.request));
    return;
  }
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
