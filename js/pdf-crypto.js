// Protection d'un PDF par mot de passe : chiffrement AES-256 du standard PDF
// 2.0 (algorithme « R6 »), calculé avec la cryptographie intégrée au navigateur
// (SubtleCrypto), sans bibliothèque. Le même mot de passe sert à ouvrir le
// fichier et à le gérer. Limite : si le mot de passe est perdu, le PDF est
// irrécupérable (il n'y a aucun moyen de le contourner, c'est le but).

const aleatoire = (n) => crypto.getRandomValues(new Uint8Array(n));

function concat(...tableaux) {
  const sortie = new Uint8Array(tableaux.reduce((s, t) => s + t.length, 0));
  let p = 0;
  for (const t of tableaux) {
    sortie.set(t, p);
    p += t.length;
  }
  return sortie;
}

const hex = (octets) => [...octets].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (algo, octets) => new Uint8Array(await crypto.subtle.digest(algo, octets));

// AES-CBC sans bourrage (WebCrypto en ajoute toujours : on retire le bloc en trop).
async function aesSansBourrage(cle, iv, donnees) {
  const k = await crypto.subtle.importKey("raw", cle, "AES-CBC", false, ["encrypt"]);
  const sortie = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, k, donnees));
  return sortie.slice(0, donnees.length);
}

// « Algorithme 2.B » de la norme ISO 32000-2 : empreinte du mot de passe.
async function empreinte(mdp, sel, u = new Uint8Array(0)) {
  let K = await sha("SHA-256", concat(mdp, sel, u));
  let E = null;
  for (let i = 0; i < 64 || E[E.length - 1] > i - 32; i++) {
    const unTour = concat(mdp, K, u);
    const K1 = new Uint8Array(unTour.length * 64);
    for (let j = 0; j < 64; j++) K1.set(unTour, j * unTour.length);
    E = await aesSansBourrage(K.slice(0, 16), K.slice(16, 32), K1);
    let somme = 0;
    for (let j = 0; j < 16; j++) somme += E[j];
    K = await sha(["SHA-256", "SHA-384", "SHA-512"][somme % 3], E);
  }
  return K.slice(0, 32);
}

// Renvoie { dictionnaire, idFichier, chiffrerFlux } pour un mot de passe donné.
export async function preparerChiffrement(motDePasse) {
  const mdp = new TextEncoder().encode(motDePasse).slice(0, 127);
  const cle = aleatoire(32); // clé de chiffrement du fichier
  const zero = new Uint8Array(16);

  const selValidationU = aleatoire(8);
  const selCleU = aleatoire(8);
  const U = concat(await empreinte(mdp, selValidationU), selValidationU, selCleU);
  const UE = await aesSansBourrage(await empreinte(mdp, selCleU), zero, cle);

  const selValidationO = aleatoire(8);
  const selCleO = aleatoire(8);
  const O = concat(await empreinte(mdp, selValidationO, U), selValidationO, selCleO);
  const OE = await aesSansBourrage(await empreinte(mdp, selCleO, U), zero, cle);

  // Droits : tout autorisé (-4 = 0xFFFFFFFC).
  const droits = concat(new Uint8Array([0xfc, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x54, 0x61, 0x64, 0x62]), aleatoire(4));
  const Perms = await aesSansBourrage(cle, zero, droits);

  const cleAes = await crypto.subtle.importKey("raw", cle, "AES-CBC", false, ["encrypt"]);
  const id = aleatoire(16);
  return {
    idFichier: hex(id),
    dictionnaire: `<< /Filter /Standard /V 5 /R 6 /Length 256 /P -4 /EncryptMetadata true /CF << /StdCF << /AuthEvent /DocOpen /CFM /AESV3 /Length 32 >> >> /StmF /StdCF /StrF /StdCF /O <${hex(O)}> /U <${hex(U)}> /OE <${hex(OE)}> /UE <${hex(UE)}> /Perms <${hex(Perms)}> >>`,
    // Chaque flux : IV aléatoire de 16 octets suivi des données chiffrées.
    async chiffrerFlux(octets) {
      const iv = aleatoire(16);
      return concat(iv, new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, cleAes, octets)));
    },
  };
}
