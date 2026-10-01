// Constantes de l'appli : tailles d'images, qualités d'export, réglages par défaut.

// Photo gardée dans le document (assez grande pour un A4 lisible, assez légère
// pour le stockage du navigateur).
export const COTE_SOURCE_MAX = 2400;
export const QUALITE_SOURCE = 0.88;
// Aperçu pendant la retouche (le calcul des filtres doit rester fluide).
export const COTE_APERCU = 1100;
export const COTE_MINIATURE = 320;

export const FILTRES = [
  { id: "nette", nom: "Document", aide: "Fond blanchi, texte net (recommandé)" },
  { id: "original", nom: "Original", aide: "Photo recadrée, sans traitement" },
  { id: "gris", nom: "Gris", aide: "Niveaux de gris, fond uniforme" },
  { id: "nb", nom: "Noir & blanc", aide: "Texte noir sur fond blanc, très léger" },
];

export const REGLAGES_DEFAUT = { filtre: "nette", luminosite: 0, contraste: 0, nettete: 0, rotation: 0 };

// Export PDF : taille maximale du grand côté de chaque page et qualité JPEG.
export const QUALITES_PDF = {
  standard: { nom: "Standard (léger)", cote: 1800, qualite: 0.7 },
  haute: { nom: "Haute", cote: 2400, qualite: 0.85 },
  maximale: { nom: "Maximale (lourd)", cote: 3400, qualite: 0.92 },
};

// Cadre par défaut quand aucun bord n'est détecté : tout le document, avec une petite marge.
export const COINS_DEFAUT = [
  { x: 0.04, y: 0.04 },
  { x: 0.96, y: 0.04 },
  { x: 0.96, y: 0.96 },
  { x: 0.04, y: 0.96 },
];
