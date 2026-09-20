import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type ResultatPurgeAuth = {
  ok: boolean;
  utilisateursSansAutreEntreprise: string[];
  erreurs: string[];
};

// Détache les membres de l'entreprise (utilisateurs_entreprises n'est pas
// touché par la purge opérationnelle SQL, précisément pour que cette étape
// puisse encore lire l'appartenance avant de la supprimer), puis supprime le
// compte auth.users des utilisateurs qui n'ont plus AUCUNE autre entreprise
// active. supabase.auth.admin.deleteUser() révoque au passage sessions et
// refresh tokens : un utilisateur supprimé ne peut plus se reconnecter avec
// un ancien token. Idempotent : un utilisateur déjà supprimé (ou déjà sans
// membership) est un no-op, pas une erreur.
export async function purgerAuthUtilisateursEntreprise(admin: AdminClient, entrepriseId: string): Promise<ResultatPurgeAuth> {
  const { data: memberships, error: erreurLecture } = await admin
    .from("utilisateurs_entreprises")
    .select("utilisateur_id")
    .eq("entreprise_id", entrepriseId);
  if (erreurLecture) return { ok: false, utilisateursSansAutreEntreprise: [], erreurs: [erreurLecture.message] };

  const utilisateurIds = [...new Set((memberships ?? []).map((m) => m.utilisateur_id as string))];

  const { error: erreurDetachement } = await admin.from("utilisateurs_entreprises").delete().eq("entreprise_id", entrepriseId);
  if (erreurDetachement) return { ok: false, utilisateursSansAutreEntreprise: [], erreurs: [erreurDetachement.message] };

  const sansAutreEntreprise: string[] = [];
  const erreurs: string[] = [];

  for (const utilisateurId of utilisateurIds) {
    const { count, error: erreurComptage } = await admin
      .from("utilisateurs_entreprises")
      .select("entreprise_id", { count: "exact", head: true })
      .eq("utilisateur_id", utilisateurId);
    if (erreurComptage) {
      erreurs.push(`${utilisateurId}: ${erreurComptage.message}`);
      continue;
    }
    if ((count ?? 0) > 0) continue; // encore membre d'une autre entreprise : compte conservé.

    const { error: erreurSuppression } = await admin.auth.admin.deleteUser(utilisateurId);
    if (erreurSuppression) {
      if (!/not.?found/i.test(erreurSuppression.message)) {
        erreurs.push(`${utilisateurId}: ${erreurSuppression.message}`);
        continue;
      }
    }
    sansAutreEntreprise.push(utilisateurId);
  }

  return { ok: erreurs.length === 0, utilisateursSansAutreEntreprise: sansAutreEntreprise, erreurs };
}
