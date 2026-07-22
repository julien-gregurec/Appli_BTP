import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PayloadPush = { titre: string; message: string | null; lien: string | null; niveau: string };

let configure = false;
function garantirConfiguration() {
  if (configure) return;
  const publique = process.env.VAPID_PUBLIC_KEY;
  const privee = process.env.VAPID_PRIVATE_KEY;
  const sujet = process.env.VAPID_SUBJECT;
  if (!publique || !privee || !sujet) throw new Error("Les clés VAPID ne sont pas configurées (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT).");
  webpush.setVapidDetails(sujet, publique, privee);
  configure = true;
}

export function pushEstConfigure(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

// `abonnementExpire` distingue une erreur transitoire (réessayer plus tard) d'un abonnement
// mort (410/404 — l'utilisateur a désinstallé, changé de navigateur…) qu'il faut supprimer
// pour ne pas retenter indéfiniment.
export async function envoyerNotificationPush(
  abonnement: { endpoint: string; p256dh: string; auth: string },
  payload: PayloadPush,
): Promise<{ ok: true } | { ok: false; abonnementExpire: boolean; erreur: string }> {
  garantirConfiguration();
  try {
    await webpush.sendNotification(
      { endpoint: abonnement.endpoint, keys: { p256dh: abonnement.p256dh, auth: abonnement.auth } },
      JSON.stringify(payload),
    );
    return { ok: true };
  } catch (err) {
    const statutCode = (err as { statusCode?: number }).statusCode;
    const abonnementExpire = statutCode === 404 || statutCode === 410;
    return { ok: false, abonnementExpire, erreur: err instanceof Error ? err.message : "Erreur d'envoi push" };
  }
}

// Traite UNE notification en attente : respecte la préférence de l'utilisateur pour ce type
// (par défaut activé — modèle opt-out, cf. migration 20260723000131), envoie sur tous ses
// appareils abonnés, nettoie les abonnements morts (410/404), et marque la notification
// comme traitée dans tous les cas pour ne jamais la retenter en boucle. Appelée à la fois par
// le webhook temps réel (une notification) et le cron de secours (plusieurs en attente).
export async function traiterNotificationPush(admin: SupabaseClient, notificationId: string): Promise<void> {
  const { data: notification } = await admin
    .from("notifications_utilisateurs")
    .select("id, utilisateur_id, type, titre, message, lien, niveau, push_envoyee_at")
    .eq("id", notificationId)
    .maybeSingle();
  if (!notification || notification.push_envoyee_at) return;

  try {
    if (!pushEstConfigure()) return;

    const [{ data: preference }, { data: abonnements }] = await Promise.all([
      admin.from("preferences_notifications_push").select("actif").eq("utilisateur_id", notification.utilisateur_id).eq("type", notification.type).maybeSingle(),
      admin.from("push_abonnements").select("id, endpoint, p256dh, auth").eq("utilisateur_id", notification.utilisateur_id),
    ]);
    if (preference?.actif === false) return;
    if (!abonnements?.length) return;

    const payload = { titre: notification.titre, message: notification.message, lien: notification.lien, niveau: notification.niveau };
    await Promise.all(
      abonnements.map(async (abonnement) => {
        const resultat = await envoyerNotificationPush(abonnement, payload);
        if (!resultat.ok && resultat.abonnementExpire) {
          await admin.from("push_abonnements").delete().eq("id", abonnement.id);
        }
      }),
    );
  } finally {
    await admin.from("notifications_utilisateurs").update({ push_envoyee_at: new Date().toISOString() }).eq("id", notificationId);
  }
}
