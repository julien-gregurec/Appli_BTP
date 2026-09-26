// CH-09 : carte de localisation d'un chantier à partir de tuiles OpenStreetMap
// standard (projection Web Mercator, tuiles 256 px). Calcul pur, sans dépendance
// ni clé d'API : la page compose la carte avec de simples <img>, déjà autorisées
// par la CSP (img-src https:), sans élargir frame-src ni script-src.

export const TAILLE_TUILE = 256;
export const ZOOM_CARTE_DEFAUT = 16;

export type TuileCarte = { x: number; y: number; url: string; gauche: number; haut: number };
export type CarteTuiles = {
  zoom: number;
  tuiles: TuileCarte[];
  /** Position du marqueur dans le calque de tuiles, en pixels. */
  marqueur: { gauche: number; haut: number };
  /** Rayon du périmètre de pointage, en pixels au zoom retenu (null si absent). */
  rayonPixels: number | null;
  largeur: number;
  hauteur: number;
};

export function coordonneesValides(latitude: unknown, longitude: unknown): boolean {
  const lat = Number(latitude), lng = Number(longitude);
  return latitude !== null && longitude !== null && latitude !== undefined && longitude !== undefined
    && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85.05112878 && Math.abs(lng) <= 180;
}

/** Position fractionnaire (en tuiles) d'un point au zoom donné. */
export function positionTuile(latitude: number, longitude: number, zoom: number) {
  const n = 2 ** zoom;
  const latRad = (latitude * Math.PI) / 180;
  return {
    x: ((longitude + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

/** Mètres représentés par un pixel à cette latitude et ce zoom. */
export function metresParPixel(latitude: number, zoom: number) {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

/**
 * Grille de tuiles centrée sur le point : `colonnes` × `lignes` tuiles autour de la
 * tuile contenant le point (valeurs impaires pour garder le point au centre).
 */
export function carteTuiles(
  latitude: number,
  longitude: number,
  options: { zoom?: number; rayonMetres?: number | null; colonnes?: number; lignes?: number } = {},
): CarteTuiles {
  const zoom = options.zoom ?? ZOOM_CARTE_DEFAUT;
  const colonnes = options.colonnes ?? 5;
  const lignes = options.lignes ?? 3;
  const n = 2 ** zoom;
  const position = positionTuile(latitude, longitude, zoom);
  const centreX = Math.floor(position.x);
  const centreY = Math.floor(position.y);
  const demiColonnes = Math.floor(colonnes / 2);
  const demiLignes = Math.floor(lignes / 2);

  const tuiles: TuileCarte[] = [];
  for (let ligne = 0; ligne < lignes; ligne++) {
    const y = centreY - demiLignes + ligne;
    if (y < 0 || y >= n) continue;
    for (let colonne = 0; colonne < colonnes; colonne++) {
      const x = (((centreX - demiColonnes + colonne) % n) + n) % n;
      tuiles.push({
        x,
        y,
        url: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
        gauche: colonne * TAILLE_TUILE,
        haut: ligne * TAILLE_TUILE,
      });
    }
  }

  const rayon = options.rayonMetres;
  return {
    zoom,
    tuiles,
    marqueur: {
      gauche: (demiColonnes + (position.x - centreX)) * TAILLE_TUILE,
      haut: (demiLignes + (position.y - centreY)) * TAILLE_TUILE,
    },
    rayonPixels: rayon && rayon > 0 ? rayon / metresParPixel(latitude, zoom) : null,
    largeur: colonnes * TAILLE_TUILE,
    hauteur: lignes * TAILLE_TUILE,
  };
}

export function lienOpenStreetMap(latitude: number, longitude: number, zoom = 18) {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=${zoom}/${latitude}/${longitude}`;
}

export function lienRechercheAdresse(adresse: string) {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(adresse)}`;
}
