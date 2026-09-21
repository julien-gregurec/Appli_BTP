import "server-only";

/**
 * Dépôt d'un objet photo, RÉELLEMENT reprenable.
 *
 * ── Le défaut corrigé ───────────────────────────────────────────────────────
 * La V5 déposait les photos avec `upsert: true`, en expliquant que réécrire était sans
 * danger puisque le chemin est composé par la base à partir de la clé d'idempotence :
 * réécrire signifie forcément « même photo, même envoi ».
 *
 * Le raisonnement est juste. Le code, lui, ne pouvait pas fonctionner : les policies
 * Storage de Réserves (migration 00269) n'accordent que `select` et `insert` sur
 * `storage.objects`, DÉLIBÉRÉMENT — « un fichier déposé ne peut être ni écrasé ni effacé
 * depuis l'application ». Or `upsert` se traduit par un `on conflict do update`, qui exige
 * une policy `update` inexistante. Le premier dépôt passait ; le moindre RENVOI se
 * heurtait à « new row violates row-level security policy », remonté à l'utilisateur en
 * « Le téléversement a été interrompu ».
 *
 * Conséquence sur le terrain, mesurée en recette : une photo dont l'objet était déjà
 * déposé mais dont l'accusé s'était perdu ne repartait JAMAIS. La file retentait cinq
 * fois, échouait cinq fois, puis abandonnait — et le constat photographique, celui-là
 * même qui sert de preuve à la levée, était perdu alors qu'il se trouvait déjà dans le
 * bucket.
 *
 * ── Le correctif ────────────────────────────────────────────────────────────
 * On dépose SANS écrasement, et l'on considère « l'objet existe déjà » comme un SUCCÈS.
 * C'est exact et non un contournement : le chemin est dérivé de la clé d'idempotence, donc
 * un objet présent à cette adresse est nécessairement le nôtre, déjà téléversé. Le code
 * rejoint ainsi la règle de sécurité au lieu de la contredire — rien n'est jamais écrasé.
 */

/** Un dépôt refusé pour cause d'objet déjà présent, quelle que soit la forme du message. */
export function estObjetDejaPresent(erreur: unknown): boolean {
  if (!erreur || typeof erreur !== "object") return false;
  const details = erreur as { message?: string; statusCode?: string | number; error?: string };
  const statut = String(details.statusCode ?? "");
  if (statut === "409") return true;
  const message = `${details.message ?? ""} ${details.error ?? ""}`.toLowerCase();
  return message.includes("already exists")
      || message.includes("resource already exists")
      || message.includes("duplicate");
}

type ClientStockage = {
  storage: {
    from: (bucket: string) => {
      upload: (
        chemin: string, fichier: Blob | File,
        options?: { contentType?: string; upsert?: boolean },
      ) => PromiseLike<{ error: unknown }>;
    };
  };
};

/**
 * Dépose le fichier à l'emplacement réservé par la base.
 *
 * Rend `null` en cas de succès — y compris quand l'objet était déjà là — sinon l'erreur
 * de stockage, que l'appelant traduira pour l'utilisateur.
 */
export async function deposerObjet(
  supabase: ClientStockage,
  bucket: string,
  chemin: string,
  fichier: File,
): Promise<unknown | null> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(chemin, fichier, { contentType: fichier.type, upsert: false });
  if (!error) return null;
  return estObjetDejaPresent(error) ? null : error;
}
