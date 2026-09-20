import type { createAdminClient } from "@/lib/supabase/admin";

// Les 12 buckets connus, cloisonnés par entreprise_id (voir grep sur
// storage.from("...") dans src/). Une entreprise peut n'avoir aucun fichier
// dans certains d'entre eux : c'est normal et géré comme un résultat vide.
export const BUCKETS_RGPD = [
  "bulletins-paie",
  "chantier-documents",
  "devis-medias",
  "documents-employes",
  "documents-paie",
  "entreprise-assets",
  "factures-fournisseurs",
  "fiches-techniques",
  "messagerie-medias",
  "notes-frais",
  "notes-frais-exports",
  "pointage-preuves",
] as const;

export type BucketRgpd = (typeof BUCKETS_RGPD)[number];

type AdminClient = ReturnType<typeof createAdminClient>;

const PROFONDEUR_MAX = 6;
const PAGE_TAILLE = 1000;

// Un dossier Supabase Storage se distingue d'un fichier par id=null (aucune
// métadonnée de fichier). On ne suppose PAS que entrepriseId est toujours le
// 1er segment du chemin (ex. notes-frais-exports utilise
// "companies/{entrepriseId}/exports/...") : on descend récursivement et on
// reconnaît le dossier portant exactement le nom de l'entreprise, à
// n'importe quelle profondeur bornée.
async function listerRecursif(
  admin: AdminClient,
  bucket: string,
  entrepriseId: string,
  prefixe: string,
  profondeur: number,
): Promise<{ chemins: string[]; erreurs: string[] }> {
  if (profondeur > PROFONDEUR_MAX) return { chemins: [], erreurs: [`${bucket}:${prefixe}: profondeur maximale atteinte`] };

  const chemins: string[] = [];
  const erreurs: string[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(prefixe, {
      limit: PAGE_TAILLE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      erreurs.push(`${bucket}:${prefixe || "/"}: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;

    for (const entree of data) {
      const chemin = prefixe ? `${prefixe}/${entree.name}` : entree.name;
      const estDossier = entree.id === null;
      if (estDossier) {
        if (entree.name === entrepriseId) {
          // Dossier trouvé : tout ce qui est dessous appartient à l'entreprise.
          const sous = await listerTout(admin, bucket, chemin, 0);
          chemins.push(...sous.chemins);
          erreurs.push(...sous.erreurs);
        } else {
          const sous = await listerRecursif(admin, bucket, entrepriseId, chemin, profondeur + 1);
          chemins.push(...sous.chemins);
          erreurs.push(...sous.erreurs);
        }
      }
    }

    if (data.length < PAGE_TAILLE) break;
    offset += PAGE_TAILLE;
  }

  return { chemins, erreurs };
}

// Une fois le dossier de l'entreprise localisé, on liste tout son contenu
// sans plus filtrer par nom (tout lui appartient).
async function listerTout(
  admin: AdminClient,
  bucket: string,
  prefixe: string,
  profondeur: number,
): Promise<{ chemins: string[]; erreurs: string[] }> {
  if (profondeur > PROFONDEUR_MAX) return { chemins: [], erreurs: [`${bucket}:${prefixe}: profondeur maximale atteinte`] };

  const chemins: string[] = [];
  const erreurs: string[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(prefixe, { limit: PAGE_TAILLE, offset });
    if (error) {
      erreurs.push(`${bucket}:${prefixe}: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;

    for (const entree of data) {
      const chemin = `${prefixe}/${entree.name}`;
      if (entree.id === null) {
        const sous = await listerTout(admin, bucket, chemin, profondeur + 1);
        chemins.push(...sous.chemins);
        erreurs.push(...sous.erreurs);
      } else {
        chemins.push(chemin);
      }
    }

    if (data.length < PAGE_TAILLE) break;
    offset += PAGE_TAILLE;
  }

  return { chemins, erreurs };
}

export type ResultatBucket = { bucket: BucketRgpd; chemins: string[]; erreurs: string[] };

// Étape 1, réutilisée par l'export (lister sans supprimer) et par la purge.
export async function listerFichiersEntreprise(admin: AdminClient, entrepriseId: string): Promise<ResultatBucket[]> {
  const resultats: ResultatBucket[] = [];
  for (const bucket of BUCKETS_RGPD) {
    const { chemins, erreurs } = await listerRecursif(admin, bucket, entrepriseId, "", 0);
    resultats.push({ bucket, chemins, erreurs });
  }
  return resultats;
}

export type ResultatPurgeBucket = { bucket: BucketRgpd; supprimes: number; erreurs: string[] };

// Suppression idempotente : un fichier déjà absent n'est pas une erreur côté
// Supabase Storage (remove() ne renvoie pas d'erreur pour un chemin
// manquant), donc rejouer la purge après un succès partiel ne fait que
// constater qu'il ne reste rien à supprimer.
export async function purgerStorageEntreprise(admin: AdminClient, entrepriseId: string): Promise<ResultatPurgeBucket[]> {
  const inventaire = await listerFichiersEntreprise(admin, entrepriseId);
  const resultats: ResultatPurgeBucket[] = [];

  for (const { bucket, chemins, erreurs } of inventaire) {
    const erreursBucket = [...erreurs];
    let supprimes = 0;
    for (let i = 0; i < chemins.length; i += 100) {
      const lot = chemins.slice(i, i + 100);
      const { data, error } = await admin.storage.from(bucket).remove(lot);
      if (error) {
        erreursBucket.push(`${bucket}: suppression du lot ${i / 100 + 1} échouée : ${error.message}`);
        continue;
      }
      supprimes += data?.length ?? lot.length;
    }
    resultats.push({ bucket, supprimes, erreurs: erreursBucket });
  }

  return resultats;
}

export function purgeStorageReussie(resultats: ResultatPurgeBucket[]): boolean {
  return resultats.every((r) => r.erreurs.length === 0);
}
