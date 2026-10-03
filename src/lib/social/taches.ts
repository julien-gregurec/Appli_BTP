import type { SupabaseClient } from "@supabase/supabase-js";
import { traiterFilePublication } from "@/lib/social/publication";
import { synchroniserCommentaires, synchroniserMessages, synchroniserStatistiques, traiterEvenementsWebhook } from "@/lib/social/synchronisation";
import { journaliser } from "@/lib/social/audit";

/**
 * Tâches périodiques ELSATIA Social. Appelées par /api/social/cron (planificateur
 * fréquent, idéalement toutes les 5 minutes) et, en rattrapage quotidien, par
 * le cron Vercel existant /api/cron/abonnements.
 */
export async function executerTachesSociales(admin: SupabaseClient, options: { synchroniser: boolean }) {
  const publication = await traiterFilePublication(admin);
  const webhooks = await traiterEvenementsWebhook(admin);
  await admin.from("social_connexions_en_attente").delete().lt("expire_at", new Date().toISOString());

  let synchronisation: Record<string, unknown> | null = null;
  if (options.synchroniser) {
    synchronisation = {
      statistiques: await synchroniserStatistiques(admin),
      commentaires: await synchroniserCommentaires(admin),
      messages: await synchroniserMessages(admin),
    };
  }

  // Alerte d'expiration : un compte qui expire sous 10 jours est signalé dans le journal.
  const { data: expirent } = await admin
    .from("social_comptes")
    .select("id,reseau,nom_compte,token_expires_at,data_access_expires_at")
    .eq("statut", "connecte")
    .or(`token_expires_at.lt.${new Date(Date.now() + 10 * 86400_000).toISOString()},data_access_expires_at.lt.${new Date(Date.now() + 10 * 86400_000).toISOString()}`);
  if (options.synchroniser) {
    for (const c of expirent ?? []) {
      await journaliser(admin, { acteur: "système", action: "jeton_bientot_expire", reseau: c.reseau, objetId: c.id, details: { compte: c.nom_compte, expire: c.token_expires_at, acces_donnees: c.data_access_expires_at } });
    }
  }
  return { publication, webhooks, synchronisation, comptesBientotExpires: expirent?.length ?? 0 };
}
