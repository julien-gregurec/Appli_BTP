import sharp from "sharp";

/**
 * Fabrique une photo de test DELIBEREMENT piegee.
 *
 * Elle porte ce qu'une photo de chantier porte reellement et qu'il faut
 * retirer : coordonnees GPS, orientation EXIF, marque et modele d'appareil,
 * logiciel, date de prise de vue, profil colorimetrique embarque.
 *
 * Elle est fabriquee a l'execution plutot que versionnee en binaire : un
 * fichier binaire dans le depot est opaque a la revue — personne ne peut
 * verifier en lisant un diff qu'il contient bien des coordonnees GPS. Ici le
 * piege est lisible, et les tests verifient d'abord que la fixture est bien
 * piegee AVANT de verifier que le nettoyage la desamorce. Une fixture qui
 * aurait cesse de porter du GPS ferait passer le nettoyage pour efficace sans
 * rien prouver.
 *
 * L'image mesure 40x20 : le rapport est volontairement asymetrique pour que
 * l'application d'une orientation a un quart de tour soit observable sur les
 * dimensions du resultat.
 */

/** Valeurs de test, reconnaissables et sans rapport avec un lieu ou un appareil reels. */
export const GPS_FIXTURE = { latitude: "48/1 51/1 2999/100", longitude: "2/1 17/1 2999/100" };
export const MARQUE_FIXTURE = "FabricantDeRecette";
export const MODELE_FIXTURE = "ModeleDeRecette X1";
export const LOGICIEL_FIXTURE = "LogicielDeRecette 1.0";
export const DATE_FIXTURE = "2026:09:10 08:30:00";

/** Orientation 6 : un quart de tour horaire a appliquer, comme un portrait de telephone. */
export const ORIENTATION_FIXTURE = 6;

export const LARGEUR_FIXTURE = 40;
export const HAUTEUR_FIXTURE = 20;

/**
 * JPEG de test portant EXIF complet, GPS, orientation et profil colorimetrique.
 *
 * `withExif` ecrit les repertoires demandes — IFD0 pour l'appareil, IFD1 pour
 * la miniature, IFD2 pour la date de prise de vue, IFD3 pour le GPS — et
 * `withMetadata({ orientation })` pose l'orientation, que `withExif` seul ne
 * suffit pas a fixer. `withIccProfile` ajoute un bloc de metadonnees d'une
 * autre nature, pour que le nettoyage ne soit pas eprouve sur le seul EXIF.
 */
export async function photoPiegee(): Promise<Buffer> {
  return sharp({
    create: {
      width: LARGEUR_FIXTURE,
      height: HAUTEUR_FIXTURE,
      channels: 3,
      background: { r: 20, g: 120, b: 200 },
    },
  })
    .withExif({
      IFD0: {
        Make: MARQUE_FIXTURE,
        Model: MODELE_FIXTURE,
        Software: LOGICIEL_FIXTURE,
        DateTime: DATE_FIXTURE,
        Orientation: String(ORIENTATION_FIXTURE),
      },
      IFD1: { Compression: "6" },
      IFD2: { DateTimeOriginal: DATE_FIXTURE, DateTimeDigitized: DATE_FIXTURE },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: GPS_FIXTURE.latitude,
        GPSLongitudeRef: "E",
        GPSLongitude: GPS_FIXTURE.longitude,
      },
    })
    .withMetadata({ orientation: ORIENTATION_FIXTURE })
    .withIccProfile("srgb")
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** Une image sans aucune metadonnee : temoin negatif. */
export async function photoPropre(): Promise<Buffer> {
  return sharp({
    create: { width: LARGEUR_FIXTURE, height: HAUTEUR_FIXTURE, channels: 3, background: { r: 10, g: 10, b: 10 } },
  })
    .png()
    .toBuffer();
}

/** Compte les debuts d'image JPEG. Une miniature embarquee en produit un second. */
export function compterDebutsJpeg(contenu: Uint8Array): number {
  let total = 0;
  for (let i = 0; i + 2 < contenu.length; i += 1) {
    if (contenu[i] === 0xff && contenu[i + 1] === 0xd8 && contenu[i + 2] === 0xff) total += 1;
  }
  return total;
}

/**
 * Cherche le repertoire GPS dans un bloc EXIF, en le LISANT.
 *
 * Une recherche de texte ne prouverait rien : les coordonnees GPS sont stockees
 * en rationnels binaires, pas sous la forme « 48/1 51/1 ». Chercher cette
 * chaine dans les octets ne la trouve ni avant ni apres le nettoyage, et
 * l'assertion serait vacante — elle passerait au vert sans rien demontrer.
 *
 * On analyse donc l'entete TIFF puis les entrees de l'IFD0, a la recherche du
 * pointeur `GPSInfo` (etiquette 0x8825). Sa presence signifie qu'un repertoire
 * GPS existe reellement dans le fichier.
 */
export function contientRepertoireGps(exif: Buffer | undefined): boolean {
  if (!exif || exif.byteLength < 16) return false;
  // Sharp prefixe le bloc par « Exif » et deux octets nuls sur certaines
  // sorties : on se cale sur l'entete TIFF, reperable a son ordre d'octets.
  let debut = exif.indexOf(Buffer.from([0x49, 0x49, 0x2a, 0x00]));
  let petitBoutiste = true;
  if (debut < 0) {
    debut = exif.indexOf(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]));
    petitBoutiste = false;
  }
  if (debut < 0) return false;

  const lire16 = (offset: number) => petitBoutiste ? exif.readUInt16LE(offset) : exif.readUInt16BE(offset);
  const lire32 = (offset: number) => petitBoutiste ? exif.readUInt32LE(offset) : exif.readUInt32BE(offset);

  const ifd0 = debut + lire32(debut + 4);
  if (ifd0 + 2 > exif.byteLength) return false;
  const entrees = lire16(ifd0);
  for (let i = 0; i < entrees; i += 1) {
    const entree = ifd0 + 2 + i * 12;
    if (entree + 12 > exif.byteLength) return false;
    if (lire16(entree) === 0x8825) return true; // GPSInfo
  }
  return false;
}
