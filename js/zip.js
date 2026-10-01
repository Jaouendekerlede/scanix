// Archive ZIP écrite et lue à la main (sans compression : les JPEG sont déjà
// compressés). Sert à exporter toutes les pages en images et à la sauvegarde
// complète. Limite : pas de ZIP64 (archives de moins de 4 Go, ce qui suffit).

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(octets) {
  let c = 0xffffffff;
  for (let i = 0; i < octets.length; i++) c = TABLE[(c ^ octets[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dateDos(date) {
  return {
    heure: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    jour: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

// `fichiers` : [{ nom, donnees: Blob | Uint8Array | string }]. Renvoie un Blob ZIP.
export async function creerZip(fichiers) {
  const encodeur = new TextEncoder();
  const morceaux = [];
  const centrale = [];
  let position = 0;
  const { heure, jour } = dateDos(new Date());
  for (const f of fichiers) {
    const nom = encodeur.encode(f.nom);
    const donnees = f.donnees instanceof Blob ? new Uint8Array(await f.donnees.arrayBuffer()) : typeof f.donnees === "string" ? encodeur.encode(f.donnees) : f.donnees;
    const crc = crc32(donnees);
    const entete = new DataView(new ArrayBuffer(30));
    entete.setUint32(0, 0x04034b50, true);
    entete.setUint16(4, 20, true);
    entete.setUint16(6, 0x0800, true); // noms en UTF-8
    entete.setUint16(8, 0, true); // sans compression
    entete.setUint16(10, heure, true);
    entete.setUint16(12, jour, true);
    entete.setUint32(14, crc, true);
    entete.setUint32(18, donnees.length, true);
    entete.setUint32(22, donnees.length, true);
    entete.setUint16(26, nom.length, true);
    entete.setUint16(28, 0, true);
    morceaux.push(entete.buffer, nom, donnees);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, heure, true);
    c.setUint16(14, jour, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, donnees.length, true);
    c.setUint32(24, donnees.length, true);
    c.setUint16(28, nom.length, true);
    c.setUint32(42, position, true);
    centrale.push(c.buffer, nom);
    position += 30 + nom.length + donnees.length;
  }
  const tailleCentrale = centrale.reduce((s, m) => s + (m.byteLength ?? m.length), 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, fichiers.length, true);
  fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentrale, true);
  fin.setUint32(16, position, true);
  return new Blob([...morceaux, ...centrale, fin.buffer], { type: "application/zip" });
}

// Lit un ZIP : renvoie { nom: () => Promise<Uint8Array> } pour chaque fichier.
export async function lireZip(blob) {
  const fin = new Uint8Array(await blob.slice(Math.max(0, blob.size - 65557)).arrayBuffer());
  const vue = new DataView(fin.buffer);
  let eocd = -1;
  for (let i = fin.length - 22; i >= 0; i--) {
    if (vue.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ce fichier n'est pas une archive ZIP");
  const total = vue.getUint16(eocd + 10, true);
  const tailleCentrale = vue.getUint32(eocd + 12, true);
  const debutCentrale = vue.getUint32(eocd + 16, true);
  const centrale = new DataView(await blob.slice(debutCentrale, debutCentrale + tailleCentrale).arrayBuffer());
  const decodeur = new TextDecoder();
  const fichiers = {};
  let p = 0;
  for (let i = 0; i < total; i++) {
    if (centrale.getUint32(p, true) !== 0x02014b50) throw new Error("archive ZIP abîmée");
    const methode = centrale.getUint16(p + 10, true);
    const taille = centrale.getUint32(p + 20, true);
    const tailleNom = centrale.getUint16(p + 28, true);
    const tailleExtra = centrale.getUint16(p + 30, true);
    const tailleCom = centrale.getUint16(p + 32, true);
    const decalage = centrale.getUint32(p + 42, true);
    const nom = decodeur.decode(new Uint8Array(centrale.buffer, p + 46, tailleNom));
    fichiers[nom] = async () => {
      const entete = new DataView(await blob.slice(decalage, decalage + 30).arrayBuffer());
      const debut = decalage + 30 + entete.getUint16(26, true) + entete.getUint16(28, true);
      const brut = blob.slice(debut, debut + taille);
      if (methode === 0) return new Uint8Array(await brut.arrayBuffer());
      if (methode === 8) return new Uint8Array(await new Response(brut.stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
      throw new Error("méthode de compression ZIP non gérée");
    };
    p += 46 + tailleNom + tailleExtra + tailleCom;
  }
  return fichiers;
}
